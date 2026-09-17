import { prisma } from "@/lib/prisma"
import {
  resolveKnowledgeProjectScope,
  type KnowledgePrefilter,
  type ScoredKnowledgeEntry,
} from "@/lib/llm/embeddings"
import {
  FULLTEXT_INDEX_PROBE_SQL,
  createCachedFulltextProbe,
} from "@/lib/llm/keyword-capability"
import {
  KEYWORD_CHUNK_LIMIT,
  bestRelevanceByEntry,
  buildKeywordQueryText,
  buildKeywordSearchSql,
  sanitizeKeywordQuery,
} from "@/lib/llm/keyword-query"

/**
 * 关键词检索（P1 混合检索的「词面」一路）—— 数据访问层
 *
 * 纯逻辑（清洗 / SQL 拼装 / 聚合）在 `keyword-query.ts`；
 * 索引可用性探测在 `keyword-capability.ts`；本文件只负责取数与回表。
 *
 * 为什么需要这一路：纯向量召回对**精确术语**不敏感。客户名、产品型号、地名、
 * 专有名词（「中汝达」「下二闸」「bge-reranker」）在语义空间里常常挤在一起，
 * 而 FULLTEXT 能一击命中。两路排名用 RRF 融合（见 `rank-fusion.ts`）。
 *
 * ⚠️ 当前生产上这一路处于**停用**状态，且这是预期行为：
 * 生产库是 MariaDB 10.5，不支持 MySQL 专有的 `WITH PARSER ngram`，而中文全文检索
 * 离开 ngram 就不可用（内置解析器把整段落成一个 token，能建索引但召回极差 ——
 * 一个静默失败模式，比没有索引更坏）。于是混合检索在生产上等价为纯向量召回，
 * 排序稳定性由 `rank-fusion.ts` 的归一化保证（「单路有结果」是设计内的一档）。
 * 决策记录与补救路径：
 * `prisma/migrations/20260916160000_add_knowledge_chunk_fulltext/migration.sql`。
 *
 * 代码保留这一路是为了「索引一旦可用就自动生效」：换 MySQL 8、或按上述迁移文件的
 * ALTER 语句手工建好索引后，探测通过即启用词面召回，**不需要改代码或改配置**。
 *
 * 为什么是 ngram + NATURAL LANGUAGE 模式：
 *   1. 内置解析器以空格/标点分词，中文没有词边界 → 整段落成一个 token，等于不可检索。
 *      官方为此提供 ngram 解析器（CJK 专用），建索引时 `WITH PARSER ngram`。
 *   2. ngram 在 **boolean** 模式下把检索词转成「ngram 短语」，要求 n 元组连续命中，
 *      对长中文查询过于严格、召回塌陷；**NL 模式**转成「ngram 词并集」，符合检索预期。
 *   3. 官方文档所述「50% 阈值」（出现在半数以上行中的词被当停用词）是 **MyISAM** 限制，
 *      InnoDB 不受影响 —— `KnowledgeChunk` 是 InnoDB，NL 模式安全。
 *   4. RRF 只用排名、不比较分数绝对量纲，故 MySQL 相关度分与余弦分不可比也无妨。
 *
 * ngram 依赖：`ngram_token_size` 默认 2（bigram），是 read-only 服务器变量，
 * 改动后**必须重建索引**才生效。单字查询凑不出 bigram，会被直接跳过（见 `sanitizeKeywordQuery`）。
 */

export interface KeywordRetrieveInput {
  userId: string
  projectId: string
  query: string
  topicTitle?: string
  /**
   * 选题理由。**只保留在类型上（与向量召回同形，便于复用同一份 prefilter），
   * 不参与关键词召回** —— 理由见 `keyword-query.ts` 的 `buildKeywordQueryText`。
   */
  topicRationale?: string
  topK?: number
  prefilter?: KnowledgePrefilter
}

const ENTRY_SELECT = {
  id: true,
  title: true,
  content: true,
  category: true,
  tags: true,
  valueGrade: true,
} as const

/**
 * 进程级缓存的 FULLTEXT 可用性探测（缓存与重试策略见 `keyword-capability.ts`）。
 *
 * 一次性日志写在这里、而不是写在 `retrieveEntriesByKeyword` 里：探测结果被缓存，
 * 回调因此只在首次探得确定结果时触发一次；写在检索路径上会变成每次检索一条。
 */
const isFulltextIndexAvailable = createCachedFulltextProbe(
  () => prisma.$queryRawUnsafe(FULLTEXT_INDEX_PROBE_SQL),
  {
    onResolved: ({ available, indexName }) => {
      if (available) {
        console.info(
          `[keyword-retrieval] 检测到 FULLTEXT 索引 ${indexName ?? "(未命名)"}，词面召回应启用`,
        )
        return
      }
      console.warn(
        "[keyword-retrieval] KnowledgeChunk.text 无可用 FULLTEXT 索引（生产库为 MariaDB 10.5，" +
          "不支持 WITH PARSER ngram）—— 词面路停用，混合检索等价为纯向量。" +
          "补救路径见 prisma/migrations/20260916160000_add_knowledge_chunk_fulltext/migration.sql",
      )
    },
    onError: (error) => {
      // 探测失败与「索引不存在」是两回事：前者不落缓存，下次检索会重试
      console.warn(
        "[keyword-retrieval] FULLTEXT 可用性探测失败，本轮机按不可用处理（不缓存）：",
        error instanceof Error ? error.message : error,
      )
    },
  },
)

/**
 * @description 关键词召回：FULLTEXT 命中块 → 按条目取最高相关度 → 回表取完整条目。
 *
 * 为什么拿到 id 后要回表用 Prisma 取、而不是在 SQL 里直接 SELECT e.*：
 * `KnowledgeEntry.tags` 是 Json 列。原始 SQL 读出的 Json 可能是**字符串**形态，
 * 而 `parseKnowledgeTags`（`knowledge-tags.ts:64`）要求 `Array.isArray(tags)`，
 * 形态不一致会**静默丢失** kb_scope / asset_role 标签，进而丢掉
 * `rankKnowledgeEntriesForAgent` 里 ×1.2 / ×1.35 的加权 —— 一个不报错的排序退化。
 * 回表一次换取与向量那一路**完全一致**的字段形态，这笔交易划算。
 *
 * @param input - 与向量召回同形
 * @returns 条目级结果，按相关度降序；查询无效或索引不可用时返回空数组
 */
export async function retrieveEntriesByKeyword(
  input: KeywordRetrieveInput,
): Promise<ScoredKnowledgeEntry[]> {
  const query = sanitizeKeywordQuery(buildKeywordQueryText(input))
  // 清洗放在探测之前：空/无效查询直接早退，不该为它发起一次（哪怕是被缓存的）能力探测
  if (!query) return []

  // 索引不在位就短路：不查 KnowledgeChunk、不打日志、不吃一次 errno 1191。
  // 探测结果进程级缓存，这里的开销是一次 Promise 判定。
  if (!(await isFulltextIndexAvailable())) return []

  const rows = await runKeywordQuery(input, query)
  if (rows.length === 0) return []

  const relevanceByEntry = bestRelevanceByEntry(rows)
  const topK = Math.max(1, Math.floor(input.topK ?? 12))
  const rankedIds = [...relevanceByEntry.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, topK)
    .map(([id]) => id)
  if (rankedIds.length === 0) return []

  const entries = await prisma.knowledgeEntry.findMany({
    where: { id: { in: rankedIds }, status: "active" },
    select: ENTRY_SELECT,
    take: rankedIds.length,
  })
  const byId = new Map(entries.map((entry) => [entry.id, entry]))

  // SQL 的 IN 不保证返回顺序，按相关度名次重排
  return rankedIds.flatMap((id) => {
    const entry = byId.get(id)
    return entry ? [{ ...entry, score: relevanceByEntry.get(id) ?? 0 }] : []
  })
}

async function runKeywordQuery(
  input: KeywordRetrieveInput,
  query: string,
): Promise<Array<{ entryId: unknown; relevance: unknown }>> {
  const built = buildKeywordSearchSql({
    // 作用域语义与向量那一路同源，避免两处各写一套租户判断而漂移
    scope: { ...resolveKnowledgeProjectScope(input.projectId), userId: input.userId },
    query,
    categories: input.prefilter?.categories,
    valueGrades: input.prefilter?.valueGrades,
    limit: KEYWORD_CHUNK_LIMIT,
  })

  try {
    return await prisma.$queryRawUnsafe<Array<{ entryId: unknown; relevance: unknown }>>(
      built.text,
      ...built.values,
    )
  } catch (error) {
    // 走到这里说明探测已认为索引可用（或探测恰好没覆盖到），执行却失败 —— 典型是
    // MySQL 1191「Can't find FULLTEXT index matching the column list」：索引在探测之后
    // 被删、或索引不覆盖 text 列。此处不抛错：混合检索降级为纯向量，等价 P0 行为，
    // 避免「索引异常」把一个检索请求变成 500。
    console.warn(
      "[keyword-retrieval] FULLTEXT 召回失败，本轮机降级为纯向量：",
      error instanceof Error ? error.message : error,
    )
    return []
  }
}
