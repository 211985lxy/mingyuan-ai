/**
 * FULLTEXT 词面召回的能力探测（纯逻辑 + 缓存，零业务依赖）
 *
 * 存在的原因：P1 混合检索的词面一路依赖 `KnowledgeChunk.text` 上的 ngram FULLTEXT 索引，
 * 而这个索引**能不能存在取决于数据库厂商** ——
 *   - MySQL 8：支持 `WITH PARSER ngram`，索引可建；
 *   - MariaDB 10.5（当前生产）：不支持 ngram 解析器，`ADD FULLTEXT ... WITH PARSER ngram`
 *     直接语法/函数错误。
 * 所以「索引在不在位」是运行期事实，不是编译期常量。
 *
 * 不探测的代价：MariaDB 上每次检索都会白发一条注定失败的 `MATCH ... AGAINST`，
 * 吃一次 errno 1191 异常 + 一条 warn 日志。选题生成这种高频路径上，
 * 日志会被这一条噪声淹掉，真故障反而看不见。
 *
 * 探测的代价：进程生命周期内**一次** INFORMATION_SCHEMA 查询（结果被缓存）。
 *
 * 本模块刻意不 import prisma / 不读环境变量：查询语句以常量给出，执行由调用方注入，
 * 于是判定与缓存策略可以脱离数据库单测（见 __tests__/unit/knowledge-fulltext-capability.test.ts）。
 */

/**
 * 探测 SQL：列出 `KnowledgeChunk` 上 `text` 列的索引及其类型。
 *
 * 为什么按列过滤而不是只按表过滤：`MATCH(c.text) AGAINST(...)` 要求 FULLTEXT 索引
 * **恰好覆盖 text 列**。表上若只有别的列的 FULLTEXT 索引，查询照样会报 1191。
 * 唯一参与拼接的是字面量表名与列名，不含任何外部输入。
 */
export const FULLTEXT_INDEX_PROBE_SQL =
  "SELECT INDEX_NAME, INDEX_TYPE, COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS " +
  "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'KnowledgeChunk' AND COLUMN_NAME = 'text'"

/** 词面召回依赖的列。与 `keyword-query.ts` 的 `MATCH(c.`text`)` 必须一致。 */
export const FULLTEXT_RETRIEVAL_COLUMN = "text"

export interface UsableFulltextIndex {
  available: boolean
  /** 命中的索引名，仅用于日志排查；不可用时为 null */
  indexName: string | null
}

/**
 * @description 判定探测结果里是否存在可用于 `MATCH(text)` 的 FULLTEXT 索引。
 *
 * 同时要求 `INDEX_TYPE = 'FULLTEXT'` 与 `COLUMN_NAME = 'text'` ——
 * 不依赖 SQL 侧的过滤条件（那种「SQL 已经滤过所以这里可以少判一层」的假设，
 * 会在某天有人放宽 WHERE 时静默失效）。
 *
 * @param rows - INFORMATION_SCHEMA.STATISTICS 的原始结果（形态不可信，逐字段校验）
 * @returns 是否可用，以及可用时命中的索引名
 */
export function detectUsableFulltextIndex(rows: unknown): UsableFulltextIndex {
  if (!Array.isArray(rows)) return { available: false, indexName: null }

  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const candidate = row as { INDEX_NAME?: unknown; INDEX_TYPE?: unknown; COLUMN_NAME?: unknown }
    if (typeof candidate.INDEX_TYPE !== "string") continue
    if (candidate.INDEX_TYPE.toUpperCase() !== "FULLTEXT") continue
    // 列名大小写按 MySQL 标识符规则不敏感，但读回来的通常是原样声明；两边都归一比较
    if (typeof candidate.COLUMN_NAME !== "string") continue
    if (candidate.COLUMN_NAME.toLowerCase() !== FULLTEXT_RETRIEVAL_COLUMN) continue

    return {
      available: true,
      indexName: typeof candidate.INDEX_NAME === "string" ? candidate.INDEX_NAME : null,
    }
  }
  return { available: false, indexName: null }
}

export interface CachedFulltextProbeOptions {
  /**
   * 首次探得**确定**结果时回调一次（可用 / 不可用各一次）。
   * 用于打一次性日志或埋点 —— 探测本身会被缓存，把日志写在探测外部会变成每次检索一条。
   */
  onResolved?: (result: UsableFulltextIndex) => void
  /**
   * 探测查询本身失败时回调（与「探得不可用」是两回事）。
   * 不传就静默 —— 但生产建议传，否则权限/连不上这类问题会完全无痕。
   */
  onError?: (error: unknown) => void
}

/**
 * @description 构造一个带缓存的可用性探测函数：同一进程内至多查一次库。
 *
 * 缓存策略（两条，别改）：
 *   1. **并发共享同一个 in-flight Promise** —— 选题生成会并发触发多条检索，
 *      不共享就会出现「一次启动 N 条探测查询」；
 *   2. **只在探得确定结果时落缓存** —— 查询抛错（连接抖动、权限、库不可达）返回
 *      false 但**不缓存**，下次检索会重试。若把异常也缓存成「不可用」，
 *      一次瞬时故障会让这个进程永久放弃词面召回，静默降级到重启为止。
 *
 * @param query - 执行探测 SQL 的函数（注入以便单测）
 * @param options - 可选的一次性回调
 * @returns 无参异步函数，返回「是否可用」
 */
export function createCachedFulltextProbe(
  query: () => Promise<unknown>,
  options: CachedFulltextProbeOptions = {},
): () => Promise<boolean> {
  let cached: UsableFulltextIndex | null = null
  let inFlight: Promise<boolean> | null = null

  return function isFulltextIndexAvailable(): Promise<boolean> {
    if (cached) return Promise.resolve(cached.available)
    if (inFlight) return inFlight

    inFlight = (async () => {
      try {
        const result = detectUsableFulltextIndex(await query())
        cached = result
        options.onResolved?.(result)
        return result.available
      } catch (error) {
        // 不落缓存：探测失败 ≠ 索引不存在，下次检索重试
        options.onError?.(error)
        return false
      } finally {
        inFlight = null
      }
    })()

    return inFlight
  }
}
