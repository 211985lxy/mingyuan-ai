/**
 * 排名融合（P1 混合检索）
 *
 * 混合检索把两路召回合到一张榜单上：
 *   1. 块级向量（语义）—— 见 `knowledge-chunk-index.ts`；
 *   2. MySQL FULLTEXT（词面）—— 见 `keyword-retrieval.ts`。
 *
 * 难点是两路的分数量纲完全不同：
 *   - 余弦相似度：0–1，且随语料分布漂移（同一 query 换语料就换分布）；
 *   - MySQL `MATCH()` 相关度：无上界的 TF-IDF 变体，与余弦分不可比。
 * 所以不能用加权求和，只能用 RRF（Reciprocal Rank Fusion）：只吃排名、不吃分数，
 * 天然免疫量纲差异。score(d) = Σ_l w_l / (k + rank_l(d))，未出现在某榜单则该项不贡献。
 *
 * ⚠️ 顺序铁律：融合必须发生在业务重排**之前**。
 *   `rankKnowledgeEntriesForAgent`（`aim-knowledge-context.ts:227`）的
 *   类别/分级/标签倍率是**业务偏好**，不是语义相关性。顺序反了，RRF 的相对顺序
 *   会被业务倍率污染。本模块的唯一调用点在 `knowledge-retrieval.ts`，位于业务重排之前，
 *   不要把它上移到 `aim-knowledge-context.ts`。P2 的 reranker 同理。
 */

/** RRF 平滑常数。60 是原论文与主流实现（Elasticsearch / Vespa）的默认值。 */
export const DEFAULT_RRF_K = 60

/**
 * 归一化下限。融合分被线性映射到 `[FUSION_SCORE_FLOOR, 1]`。
 *
 * 这个常量不是装饰，它决定「检索信号」与「业务倍率」谁说了算。
 *
 * **问题**：RRF 原始分的跨度不是一个受控量，它由两路榜单的重合结构决定。
 * 实测融合后 top1/top12 的原始跨度（见 verify-hybrid.mjs 第 2 节）：
 *
 * | 两路结构 | 原始跨度 |
 * |---|---|
 * | 单路有结果（关键词路降级/索引缺失） | **1.180×** |
 * | 两路完全重合 | 1.180× |
 * | 两路完全不重合 | 1.180× |
 * | 两路部分重合（关键词只命中前 2） | **2.361×** |
 *
 * 而 `rankKnowledgeEntriesForAgent`（`aim-knowledge-context.ts:227`）的业务倍率
 * 跨度可达约 **2.5×**（优先类 1.15 / 0.85 × 分级 1.3 / 0.7 × 标签 1.2 / 1.35 × 策略 categoryBoost）。
 *
 * 于是在 1.180× 那一档（**恰好就是关键词路没结果、混合退化成纯向量的降级场景**）
 * 业务倍率会把检索顺序整个翻过来。实测数字：
 *   原始：首位 ×0.85 = 0.013934  vs  末位 ×1.15 = 0.015972  → **检索首位被翻盘**
 *   归一首位 ×0.85 = 0.850000  vs  末位 ×1.15 = 0.575000  → 检索首位保住
 *
 * **结论**：不做归一化，排序稳定性就变成「两路偶然重合多少」的函数——
 * 同一份知识、同一个查询，只因 FULLTEXT 索引在不在位，排序行为就换一套。
 * 归一化把跨度钉死在固定值上，让下游行为可预测：
 *   - `0.5` → 2× 跨度，与业务倍率量级相当，两侧都能参与排序（**默认**）；
 *   - 调大（如 0.8 → 1.25×）→ 排序几乎由检索决定，业务偏好失效；
 *   - 调小 → 趋近原始 RRF，业务偏好压倒检索。
 * 改动前先用 `scripts/aim-retrieval-baseline.ts` 跑 hitRate@k 对照。
 */
export const FUSION_SCORE_FLOOR = 0.5

/** 融合后的小数位。避免浮点噪声让同一输入产出不同字符串（影响测试与日志比对）。 */
const SCORE_PRECISION = 6

export interface FusedRank {
  id: string
  /** RRF 原始分（未归一化） */
  score: number
  /** 各榜单中的 1-based 名次；0 表示未出现在该榜单 */
  ranks: number[]
}

export interface FusionOptions {
  /** RRF 平滑常数，默认 `DEFAULT_RRF_K` */
  k?: number
  /** 各榜单权重，缺省为 1；权重 ≤ 0 的榜单整体忽略 */
  weights?: number[]
  /** 归一化下限，默认 `FUSION_SCORE_FLOOR` */
  floor?: number
}

/**
 * @description RRF 融合多张已排序榜单。同一榜单内的重复 id 只记首次名次。
 * @param lists - 各榜单（按相关度降序，元素只需带 id）
 * @param options - k 与 weights
 * @returns 按融合分降序的排名，附各榜单名次便于诊断
 */
export function reciprocalRankFusion(
  lists: ReadonlyArray<ReadonlyArray<{ id: string }>>,
  options: Pick<FusionOptions, "k" | "weights"> = {},
): FusedRank[] {
  const k = Number.isFinite(options.k) && (options.k ?? 0) > 0 ? (options.k as number) : DEFAULT_RRF_K
  const acc = new Map<string, FusedRank>()

  lists.forEach((list, listIndex) => {
    const weight = options.weights?.[listIndex] ?? 1
    if (!(weight > 0)) return

    const seen = new Set<string>()
    let rank = 0
    for (const item of list) {
      if (!item?.id || seen.has(item.id)) continue
      seen.add(item.id)
      rank++

      const current = acc.get(item.id)
      if (current) {
        current.score += weight / (k + rank)
        current.ranks[listIndex] = rank
        continue
      }
      const ranks = new Array<number>(lists.length).fill(0)
      ranks[listIndex] = rank
      acc.set(item.id, { id: item.id, score: weight / (k + rank), ranks })
    }
  })

  return [...acc.values()].sort(compareFusedRanks)
}

/**
 * @description 把任意带 `score` 的数组的分值线性映射到 `[floor, 1]`，
 * 恢复可与业务倍率对话的动态范围。全部同分或仅一条时统一给 1
 * （无法区分，就不假装能区分）。
 *
 * 这是「检索信号 → 排序分」的唯一收口点。P1 用它压窄 RRF 的过窄跨度，
 * P2 用它压窄 reranker 的过宽跨度 —— 两个方向相反，但目标同一个：
 * **让检索分的跨度恒为 `1/floor`，不随算法与语料漂移**，下游业务倍率才可预测。
 *
 * @param items - 任意带 score 的数组
 * @param floor - 映射下限，默认 `FUSION_SCORE_FLOOR`
 * @returns 新的数组，不修改入参
 */
export function normalizeScoreToFloor<T extends { score: number }>(
  items: ReadonlyArray<T>,
  floor: number = FUSION_SCORE_FLOOR,
): T[] {
  if (items.length === 0) return []

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const item of items) {
    if (item.score < min) min = item.score
    if (item.score > max) max = item.score
  }

  const clampedFloor = clampFloor(floor)
  const span = max - min
  if (!(span > 0)) return items.map((item) => ({ ...item, score: 1 }))

  return items.map((item) => ({
    ...item,
    score: round(clampedFloor + (1 - clampedFloor) * ((item.score - min) / span)),
  }))
}

/**
 * @description 把 RRF 原始分线性映射到 `[floor, 1]`。
 * `normalizeScoreToFloor` 在 `FusedRank` 上的特化，签名与行为保持不变。
 * @param ranks - `reciprocalRankFusion` 的输出
 * @param floor - 映射下限，默认 `FUSION_SCORE_FLOOR`
 * @returns 新的数组，不修改入参
 */
export function normalizeFusedScores(
  ranks: ReadonlyArray<FusedRank>,
  floor: number = FUSION_SCORE_FLOOR,
): FusedRank[] {
  return normalizeScoreToFloor(ranks, floor)
}

/**
 * @description 融合多张条目榜单，保留首现条的目字段、只替换分。
 * @param lists - 各榜单（元素需带 id 与 score）
 * @param options - k / weights / floor
 * @returns 融合后的条目数组，按融合分降序
 */
export function fuseEntryLists<T extends { id: string; score: number }>(
  lists: ReadonlyArray<ReadonlyArray<T>>,
  options: FusionOptions = {},
): T[] {
  const byId = new Map<string, T>()
  for (const list of lists) {
    for (const item of list) {
      if (item?.id && !byId.has(item.id)) byId.set(item.id, item)
    }
  }
  if (byId.size === 0) return []

  const fused = normalizeFusedScores(reciprocalRankFusion(lists, options), options.floor)

  // flatMap 而非 map().filter()：一处收口，避免 `!` 断言
  return fused.flatMap((rank) => {
    const source = byId.get(rank.id)
    return source ? [{ ...source, score: rank.score }] : []
  })
}

function clampFloor(floor: number): number {
  if (!Number.isFinite(floor)) return FUSION_SCORE_FLOOR
  return Math.min(1, Math.max(0, floor))
}

/**
 * 融合分相同时的稳定排序键：先看最好名次（谁在单榜里更靠前），再按 id 字典序。
 * 不依赖 `Array.prototype.sort` 的稳定性，保证同输入必得同输出。
 */
function compareFusedRanks(a: FusedRank, b: FusedRank): number {
  if (b.score !== a.score) return b.score - a.score
  const diff = bestRank(a.ranks) - bestRank(b.ranks)
  if (diff !== 0) return diff
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function bestRank(ranks: number[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const rank of ranks) {
    if (rank > 0 && rank < best) best = rank
  }
  return best
}

function round(value: number): number {
  const factor = 10 ** SCORE_PRECISION
  return Math.round(value * factor) / factor
}
