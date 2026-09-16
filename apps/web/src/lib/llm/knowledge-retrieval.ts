import { env } from "@/env"
import {
  retrieveRelevantKnowledge,
  type KnowledgePrefilter,
  type ScoredKnowledgeEntry,
} from "@/lib/llm/embeddings"
import { isChunkRetrievalEnabled, retrieveEntriesByChunks } from "@/lib/llm/knowledge-chunk-index"
import { retrieveEntriesByKeyword } from "@/lib/llm/keyword-retrieval"
import { DEFAULT_RRF_K, fuseEntryLists } from "@/lib/llm/rank-fusion"
import { rerankEntries } from "@/lib/llm/rerank-client"
import { resolveRerankCandidateLimit } from "@/lib/llm/rerank"

/**
 * 知识检索分派器（P0 建层，P1 加混合，P2 加精排）
 *
 * **全站唯一的知识检索入口。** 四级阶梯，由环境变量决定走哪级：
 *
 * | 开关 | 链路 | 行为 |
 * |---|---|---|
 * | `KNOWLEDGE_HYBRID_RETRIEVAL_ENABLED=true` + `KNOWLEDGE_RERANK_ENABLED=true` | 混合 → 精排 | 块级向量 + FULLTEXT 融合，再经 Cross-Encoder 重排 |
 * | 仅 `KNOWLEDGE_HYBRID_RETRIEVAL_ENABLED=true` | 混合 | 融合结果（P1 行为） |
 * | 仅 `KNOWLEDGE_CHUNK_RETRIEVAL_ENABLED=true` | 块级 | 仅块级向量（P0 行为） |
 * | 都关 | 条目级 | `retrieveRelevantKnowledge`，与改造前完全一致 |
 *
 * 每一级失败或返回空都会向下一级降落，所以不存在「发了代码忘建索引就没知识可用」的空窗。
 *
 * 为什么多这一层而不是在调用处 if/else：
 * 1. 检索入口只有一个（`aim/knowledge-graph-retrieval.ts:78`），改一处全站生效；
 * 2. 回退只依赖环境变量，不需要回滚代码——出问题改 env 重启即可；
 * 3. P2 的 rerank 就是这么挂上来的，上层调用方一行未改。
 *
 * ⚠️ 本模块必须在 `rankKnowledgeEntriesForAgent` **之前**执行（见 `rank-fusion.ts` 与
 * `rerank.ts` 的顺序铁律）。P2 的 reranker 同样在这个位置，**不要**把它上移。
 */

/**
 * 融合深度倍数：每路各取 `topK × 该值` 条参与融合，保证 RRF 有足够重叠空间。
 *
 * 这条深度同时是 P2 精排的候选池上限：`resolveRerankCandidateLimit(topK)` 在
 * topK=12 时给出 36，小于这里的 48，所以精排候选**始终**是融合结果的子集，
 * 不会出现「精排池里混进了没过 RRF 的条目」。两者改动时需一起看。
 */
export const FUSION_DEPTH_FACTOR = 4

/** 融合深度下限：topK 很小时也要留够候选，否则 RRF 退化成两路直接相减。 */
export const MIN_FUSION_DEPTH = 40

export interface KnowledgeRetrievalInput {
  userId: string
  projectId: string
  query: string
  topicTitle?: string
  topicRationale?: string
  topK?: number
  prefilter?: KnowledgePrefilter
}

export interface KnowledgeRetrievalResult {
  entries: ScoredKnowledgeEntry[]
  /**
   * 保持 `"embedding" | "raw"` 二元取值不动。
   *
   * 该字段的联合类型在 4 个文件里重复声明（`embeddings.ts:283`、
   * `aim-knowledge-context.ts:28`、`knowledge-graph-retrieval.ts:33`、`aim/agent-types.ts:141`），
   * 且**没有任何调用方按它分支**——它的语义是「语义链路是否成功」。
   * 混合检索是语义链路的超集，归入 `"embedding"` 是准确的；扩联合类型只会把改动面
   * 从 1 个文件扩散到 5 个，不值。
   */
  source: "embedding" | "raw"
}

/**
 * @description 混合检索是否可用：既要开混合开关，也要块级索引在位（它依赖块表）。
 * @returns 是否启用
 */
export function isHybridRetrievalEnabled(): boolean {
  return env.KNOWLEDGE_HYBRID_RETRIEVAL_ENABLED === "true" && isChunkRetrievalEnabled()
}

/**
 * @description 统一知识检索入口，按开关在混合 / 块级 / 条目级之间分级降级
 * @param input - 检索输入
 * @returns 条目级结果与来源标记
 */
export async function retrieveKnowledgeEntries(
  input: KnowledgeRetrievalInput,
): Promise<KnowledgeRetrievalResult> {
  if (isHybridRetrievalEnabled()) {
    const entries = await retrieveEntriesHybrid(input).catch((error) => {
      console.warn("[knowledge-retrieval] 混合检索失败，降级到块级/旧路径：", error)
      return [] as ScoredKnowledgeEntry[]
    })
    if (entries.length > 0) return { entries, source: "embedding" }
  }

  if (isChunkRetrievalEnabled()) {
    const entries = await retrieveEntriesByChunks(input).catch((error) => {
      console.warn("[knowledge-retrieval] 块级检索失败，回落旧路径：", error)
      return [] as ScoredKnowledgeEntry[]
    })
    if (entries.length > 0) return { entries, source: "embedding" }
  }

  return retrieveRelevantKnowledge(input)
}

/**
 * 两路并行召回 → RRF 融合 → （可选）Cross-Encoder 精排。
 *
 * 语义召回为空时**不**启用融合：embedding 未启用 / 服务不可用 / 存量索引未重建时，
 * 只剩词面命中的结果集会绕开既有的回退阶梯（核心类优先 + 最近条目），
 * 把「服务降级」表现成「结果集莫名其妙变了一批」。宁可回退，不要惊喜。
 */
async function retrieveEntriesHybrid(
  input: KnowledgeRetrievalInput,
): Promise<ScoredKnowledgeEntry[]> {
  const topK = Math.max(1, Math.floor(input.topK ?? 12))
  const depth = Math.max(MIN_FUSION_DEPTH, topK * FUSION_DEPTH_FACTOR)

  const [vector, keyword] = await Promise.all([
    retrieveEntriesByChunks({ ...input, topK: depth }).catch((error) => {
      console.warn("[knowledge-retrieval] 向量召回失败，本轮机降为纯关键词：", error)
      return [] as ScoredKnowledgeEntry[]
    }),
    retrieveEntriesByKeyword({ ...input, topK: depth }).catch((error) => {
      console.warn("[knowledge-retrieval] 关键词召回失败，本轮机降为纯向量：", error)
      return [] as ScoredKnowledgeEntry[]
    }),
  ])

  // 向量路为空 = 语义链路整体不可用。此时不融合，也不精排，
  // 直接向下降级到条目级回退阶梯（理由见上方注释）。
  if (vector.length === 0) return []

  const fused = fuseEntryLists([vector, keyword], { k: DEFAULT_RRF_K })

  // 精排：只把候选池的前 N 条送进 Cross-Encoder（O(n) 次前向，池子越大越慢），
  // 从中挑出 topK。rerankEntries 内部已吞掉所有异常并返回 null，
  // 这里再兜一层把「返回 undefined」这类意外也归一到回落路径。
  const reranked = await rerankEntries({
    query: buildRerankQuery(input),
    candidates: fused.slice(0, resolveRerankCandidateLimit(topK)),
    topK,
  }).catch(() => null)

  return reranked ?? fused.slice(0, topK)
}

/**
 * 精排用的查询文本：`query + 选题标题`，**不含 `topicRationale`**。
 *
 * Cross-Encoder 是判别式模型，把 (query, doc) 成对送进同一个 Transformer，
 * query 越长越会与 doc 竞争注意力窗口。而 `topicRationale` 是一整段
 * 「为什么选这个题」的论证，不是「要找什么知识」——塞进去是噪声。
 *
 * 与 P1 关键词路同源（同样只用 `query + topicTitle`），
 * 而语义路继续用全量文本（向量能吸收长文本，不受此限）。
 */
function buildRerankQuery(input: KnowledgeRetrievalInput): string {
  const parts = [input.query]
  if (input.topicTitle) parts.push(`选题：${input.topicTitle}`)
  return parts.join("\n")
}
