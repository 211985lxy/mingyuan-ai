import { FUSION_SCORE_FLOOR, normalizeScoreToFloor } from "@/lib/llm/rank-fusion"

/**
 * Rerank 精排（P2）—— 纯逻辑层
 *
 * 位置：`retrieveEntriesHybrid` 融合之后、`rankKnowledgeEntriesForAgent` 之前。
 *
 * 为什么需要它：RRF（P1）只吃排名不吃分数，两路召回的候选池里，
 * 「语义相近但答非所问」和「字面命中但无信息量」的条目排在什么位置全靠排名信号，
 * 粒度太粗。Cross-Encoder 把 (query, doc) 成对送进 Transformer，让两者交互，
 * 判别力远高于双塔（向量）与词频（FULLTEXT），能把真正该进上下文的条目提上来。
 *
 * ⚠️ 顺序铁律（与 `rank-fusion.ts` 同源，见该文件顶部）：
 * 本模块必须在 `rankKnowledgeEntriesForAgent`（`aim-knowledge-context.ts:227`）**之前**执行。
 * 那里的类别/分级/标签倍率是**业务偏好**，不是语义相关性；顺序反了，
 * Cross-Encoder 的 0–1 相关分会被业务倍率污染。
 *
 * ─── 为什么 rerank 分必须再归一化一次（本模块最容易被漏掉的一条） ───
 *
 * 直觉上「rerank 输出就是 0–1 的相关分，直接用」看似合理。**错。**
 * Cross-Encoder 用 sigmoid 输出，其分值的**跨度完全不受控**——由模型对「这一批候选」
 * 的判别力决定，实测可横跨 **4 个数量级**（见 `verify-rerank.mjs` 第 6 节）：
 *
 * | 候选分布 | 原始跨度 | 业务倍率 1.35× 的后果 |
 * |---|---|---|
 * | 强相关 + 弱相关混合（0.9974 → 0.0004） | **2493.5×** | 首位保住，但**业务偏好彻底失效** |
 * | top2 断层（0.9852 → 0.3211） | 3.1× | 首位保住 |
 * | 典型相关集（0.9912 → 0.4308） | 2.3× | 首位保住 |
 * | 候选几乎并列（0.8331 → 0.8249） | **1.0×** | **首位被业务倍率翻盘** |
 *
 * 两个方向的失控：
 *   - 跨度大（2493×）：一条排在末位的 S 级优先类条目，即便吃满
 *     ×1.15 ×1.2 ×1.35 ×1.3 ≈ **×2.42** 的全部业务倍率，`0.0004 × 2.42 = 0.00097`
 *     仍远低于首位的 `0.9974 × 0.85 = 0.8478` —— **业务规则形同虚设**；
 *   - 跨度小（1.0×）：`0.8331 × 0.85 = 0.7081 < 0.8249 × 1.15 = 0.9486` ——
 *     **检索顺序被业务倍率整个接管**。
 *
 * 同一套业务倍率，在不同查询下会一会儿"完全支配"、一会儿"完全无效"——
 * 这是不可预测性的极致。归一化把跨度锁死在 `1 / FUSION_SCORE_FLOOR = 2×`：
 *   - 业务倍率仍能调整顺序（末位吃满 2.42× 时可翻上首位——这是设计中的能力边界）；
 *   - 但不可能凭 1.35× 就越过一整批高相关候选（归一后首位 ×0.85 = 0.85 > 末位 ×1.15 = 0.575）。
 *
 * **话语权归常量 `FUSION_SCORE_FLOOR`，不归模型的临场判别力。** 这是本模块存在的核心理由。
 *
 * 与 P1 的关系：P1 用它压窄 RRF 的**过窄**跨度（1.18×，业务倍率压过检索），
 * P2 用它压窄 reranker 的**过宽**跨度（最多 2493×，检索压过业务）。方向相反，同一个收口点。
 */

/** 送入 reranker 的最大候选数。Cross-Encoder 是 O(n) 次前向，候选量决定延迟。 */
export const MAX_RERANK_CANDIDATES = 40

/** 候选深度倍数：取 `topK × 该值` 条送进 reranker，给它留出「选进来」的空间。 */
export const RERANK_CANDIDATE_FACTOR = 3

/** 候选下限：太少则无可重排，白白付一次 HTTP。 */
export const MIN_RERANK_CANDIDATES = 12

/**
 * 单文档送入 reranker 的字符上限。
 *
 * 取 512 而非更长，是为了与**语义路编码过的内容范围保持一致**：
 * `embeddings.ts` 的 `maxChars` 对 BGE 系列是 500，P0 的 `CHUNK_EMBED_BUDGET` 是 480。
 * 若让 reranker 看到 2000 字而向量只编码了前 500 字，两路判据的地理范围不一致，
 * 融合后的排序语义就说不清了。512 = 480（块预算）+ 标题余量。
 */
export const RERANK_DOC_MAX_CHARS = 512

/**
 * 未获 reranker 评分的候选（`top_n` 截断掉的那批）的分数衰减步长。
 *
 * 用**相对**步长而非绝对值：检索分经归一化后跨度恒为 2×，
 * 绝对值间隔（如 0.001）在这个尺度下只占 0.2%，会被任何业务倍率抹平。
 * 1% 的相对步长保证「追加条目确实低于所有获评分条目，且彼此有序」。
 */
export const APPENDED_SCORE_STEP = 0.01

export interface RerankScore {
  /** 原始 `documents` 数组的 0-based 下标 */
  index: number
  /** Cross-Encoder 相关分（0–1，越高越相关） */
  score: number
}

/**
 * @description 由 topK 推导送入 reranker 的候选数，钳制在 `[MIN, MAX]`。
 * 不单独占一个环境变量——`env.ts` 已逼近尺寸红线，能用推导解决的就不开新变量。
 * @param topK - 最终需要的条目数
 * @returns 候选数上限
 */
export function resolveRerankCandidateLimit(topK: number): number {
  const k = Number.isFinite(topK) && topK > 0 ? Math.floor(topK) : 12
  return Math.min(
    MAX_RERANK_CANDIDATES,
    Math.max(MIN_RERANK_CANDIDATES, k * RERANK_CANDIDATE_FACTOR),
  )
}

/**
 * @description 是否值得付一次 HTTP 调用。
 *
 * 判据是「池子必须显著大于取出量」——rerank 的价值来自**从更大的池子里选进来**，
 * 池子不比取出量大就没有"选进来"的空间，只剩换顺序，收益微乎其微。
 * @param candidateCount - 候选条目数
 * @param topK - 最终需要的条目数
 * @returns 是否值得调用
 */
export function shouldRerank(candidateCount: number, topK: number): boolean {
  if (!Number.isFinite(candidateCount) || candidateCount <= 0) return false
  const k = Number.isFinite(topK) && topK > 0 ? Math.floor(topK) : 12
  return candidateCount >= Math.max(MIN_RERANK_CANDIDATES, k + 1)
}

/**
 * @description 条目 → reranker 文档文本：`标题\n正文`，按预算截断。
 * 空文本给一个空格兜底（与 `embeddings.ts` 的 `(t || " ")` 同处理），
 * 避免服务端对空串报错。
 * @param entries - 候选条目
 * @returns 与入参等长的文档数组
 */
export function buildRerankDocuments(
  entries: ReadonlyArray<{ title?: string | null; content?: string | null }>,
): string[] {
  return entries.map((entry) => {
    const title = (entry.title ?? "").trim()
    const content = (entry.content ?? "").trim()
    const text = title ? `${title}\n${content}` : content
    return text.slice(0, RERANK_DOC_MAX_CHARS) || " "
  })
}

/**
 * @description 解析 rerank 响应，**逐项做边界校验**。
 *
 * `index` 由服务端给出，指向我们传上去的 `documents` 数组。这条信任边界必须自己兜住：
 * 越界、非整数、重复的 index 若直接拿去索引数组，轻则取到 `undefined` 静默丢条目，
 * 重则 TypeError 打断整条检索链路。分数同理——非有限数值会污染后续归一化。
 *
 * 缺失部分 index 是**正常现象**（`top_n` 截断），不视为错误。
 * @param payload - 响应 JSON（`unknown`，来自网络，不可信）
 * @param candidateCount - 本次提交的候选数，用于校验 index 上界
 * @returns 合法的 `{ index, score }`，按分降序；payload 畸形时返回空数组
 */
export function parseRerankResponse(payload: unknown, candidateCount: number): RerankScore[] {
  if (!isRecord(payload)) return []
  const results = payload.results
  if (!Array.isArray(results)) return []

  const out: RerankScore[] = []
  const seen = new Set<number>()

  for (const row of results) {
    if (!isRecord(row)) continue

    const index = row.index
    if (typeof index !== "number" || !Number.isInteger(index)) continue
    if (index < 0 || index >= candidateCount) continue
    if (seen.has(index)) continue

    const score = row.relevance_score
    if (typeof score !== "number" || !Number.isFinite(score)) continue

    seen.add(index)
    out.push({ index, score })
  }

  // 服务端返回时已降序，这里自己再排一次：不依赖外部契约的隐含保证
  return out.sort((a, b) => b.score - a.score)
}

/**
 * @description 按 reranker 结果重排候选，并把分值压到 `[floor, 1]`。
 *
 * 三个不变量：
 *   1. **不丢条目** —— 未获评分的候选（`top_n` 截断）按原融合顺序追加在后，
 *      分数以 `APPENDED_SCORE_STEP` 递减。丢了它们，一旦 reranker 只返回少量结果，
 *      topK 就凑不满，召回凭空缩水；
 *   2. **分数跨度恒为 `1/floor`** —— 经 `normalizeScoreToFloor`，理由见模块顶部；
 *   3. **严格降序且稳定** —— 同分按原候选顺序，不依赖 `Array.prototype.sort` 的稳定性。
 *
 * @param candidates - 融合后的候选（已按融合分降序）
 * @param scores - `parseRerankResponse` 的输出
 * @param topK - 最终返回条数
 * @param floor - 归一化下限，默认 `FUSION_SCORE_FLOOR`
 * @returns 重排、重赋分、截断后的新数组
 */
export function applyRerankOrder<T extends { id: string; score: number }>(
  candidates: ReadonlyArray<T>,
  scores: ReadonlyArray<RerankScore>,
  topK: number,
  floor: number = FUSION_SCORE_FLOOR,
): T[] {
  if (candidates.length === 0) return []

  const limit = Math.max(1, Math.floor(Number.isFinite(topK) ? topK : 1))
  const [scored, unscored] = splitByScores(candidates, scores)

  // 先解包成 T 再归一化。`normalizeScoreToFloor` 保持入参结构——直接传
  // `{ item, score }` 会返回包装数组，造成「声明 T[]、实际 {item,score}[]」：
  // 长度断言查得出，取 `.id` 才发现，是最难定位的一类不一致。
  const normalized = normalizeScoreToFloor(
    scored.map(({ item, score }) => ({ ...item, score })),
    floor,
  )

  // rest 的分数：以相对步长递减，保证「确实低于所有获评分条目且彼此有序」
  const base = clampFloorValue(floor)
  const rest = unscored.map((item, i) => ({
    ...item,
    score: round(base * Math.max(0, 1 - APPENDED_SCORE_STEP * (i + 1))),
  }))

  return [...normalized, ...rest].sort((a, b) => b.score - a.score).slice(0, limit)
}

/** 按「是否被 reranker 评过分」拆成两组，两组都保持候选原顺序。 */
function splitByScores<T extends { id: string; score: number }>(
  candidates: ReadonlyArray<T>,
  scores: ReadonlyArray<RerankScore>,
): [Array<{ item: T; score: number }>, T[]] {
  const scoredIndexes = new Set<number>()
  const scored: Array<{ item: T; score: number }> = []

  for (const entry of scores) {
    const item = candidates[entry.index]
    if (!item || scoredIndexes.has(entry.index)) continue
    scoredIndexes.add(entry.index)
    scored.push({ item, score: entry.score })
  }

  const unscored = candidates.filter((_, index) => !scoredIndexes.has(index))
  return [scored, unscored]
}

function clampFloorValue(floor: number): number {
  if (!Number.isFinite(floor)) return FUSION_SCORE_FLOOR
  return Math.min(1, Math.max(0, floor))
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
