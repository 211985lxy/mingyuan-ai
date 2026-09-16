/**
 * 关键词检索的纯函数层（零 import，可脱离 Next/Prisma 独立执行验证）
 *
 * 拆出来的原因有两个，都不是洁癖：
 * 1. **可验证**：SQL 拼装最该被断言的是「用户输入绝不出现在 SQL 文本里」。
 *    混在带 `@/lib/prisma` 的模块里就没法脱离运行时跑，这条断言只能靠人眼看。
 * 2. **职责**：本文件只做「文本 → SQL 片段」，不碰数据库、不读环境变量。
 *
 * 数据访问见 `keyword-retrieval.ts`。
 */

/**
 * 关键词查询文本上限。
 *
 * NL 模式下查询会被拆成 ngram 词并集，查询越长并集越大 → 几乎所有块都能命中一点东西，
 * **相关性排序会退化成噪声**。所以这里硬截断，而不是把整段 brief 丢进去。
 * 200 字足够覆盖「一句话意图 + 几个关键词」的常规形态。
 */
export const MAX_KEYWORD_QUERY_CHARS = 200

/** 与 `ngram_token_size` 默认值对齐：短于此长度的连续词串在 ngram 索引里无法命中。 */
export const NGRAM_QUERY_MIN_CHARS = 2

/**
 * 单次关键词检索最多取回的**块**行数（SQL LIMIT）。
 * 命中块在内存里按条目去重取最高相关度，所以这是块级上限而非条目级。
 * 600 块 ≈ 24 万字，远高于 `topK × FUSION_DEPTH_FACTOR` 的融合深度所需；调大只增加排序开销。
 */
export const KEYWORD_CHUNK_LIMIT = 600

/** 预过滤白名单最大元素个数。IN 列表不设上限会被策略侧误配拖慢查询。 */
const MAX_FILTER_VALUES = 32

/** ASCII 可见标点与布尔操作符。NL 模式下多为字面量，清掉可避免模式切换时语义突变。 */
const ASCII_PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g

/** 中文标点与全角符号（NFKC 已处理大部分全角，这里兜住漏网的）。 */
const CJK_PUNCT = /[\u2010-\u201F\u2026\u3000-\u303F\u30FB\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/g

/** 控制字符（含 NUL / 换行 / 制表）。 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

/** 至少一段连续 ≥2 个字母/数字/汉字，才可能命中 bigram 索引。 */
const SEARCHABLE_RUN = /[\p{L}\p{N}]{2,}/u

/**
 * 租户作用域。由调用方用 `resolveKnowledgeProjectScope` 解析后传入，
 * 以保证与向量那一路的隔离语义**同源**（不在这里复制一份判断逻辑）。
 */
export interface KeywordScope {
  /** 绑定项目时为其 id；未绑定项目时为 null（此时按 userId 且 projectId IS NULL 隔离） */
  projectId: string | null
  userId: string
}

export interface KeywordQueryInput {
  query: string
  /** 选题标题参与关键词召回：短、信息密度高，是纯词面检索的优质信号 */
  topicTitle?: string
  /**
   * 选题理由：允许传入但不参与关键词召回——它通常是一整段论证，
   * 塞进全文本查询会撑大 ngram 并集、拉平排序（见 buildKeywordQueryText）。
   */
  topicRationale?: string
}

export interface KeywordSearchFilters {
  scope: KeywordScope
  /** 已经过 `sanitizeKeywordQuery` 清洗的查询文本 */
  query: string
  categories?: string[]
  valueGrades?: string[]
  limit: number
}

export interface BuiltKeywordSql {
  /** 只含本模块写死的字面量与 `?` 占位符，**绝不含用户输入** */
  text: string
  values: unknown[]
}

// ─── 纯函数 ─────────────────────────────────────────────────────────────────

/**
 * @description 清洗关键词查询：NFKC 归一 → 去控制字符 → 去标点/操作符 → 折叠空白 → 截断。
 * 返回空串表示该查询构不成有效 ngram，调用方应整条跳过关键词检索。
 * @param raw - 原始查询文本
 * @param maxChars - 截断上限，默认 `MAX_KEYWORD_QUERY_CHARS`
 * @returns 可用查询文本；不可用时为空串
 */
export function sanitizeKeywordQuery(raw: string, maxChars: number = MAX_KEYWORD_QUERY_CHARS): string {
  if (typeof raw !== "string" || raw.length === 0) return ""

  const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : MAX_KEYWORD_QUERY_CHARS
  const collapsed = raw
    .normalize("NFKC")
    .replace(CONTROL_CHARS, " ")
    .replace(ASCII_PUNCT, " ")
    .replace(CJK_PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!collapsed) return ""

  const capped = collapsed.slice(0, limit).trim()
  return SEARCHABLE_RUN.test(capped) ? capped : ""
}

/**
 * @description 组装参与关键词检索的文本。
 * **刻意不纳入 `topicRationale`**：它通常是一整段论证，塞进全文本查询会撑大并集、拉平排序。
 * 语义那一路继续用它（向量能吸收长文本），词面这一路不用。
 * @param input - 至少含 query
 * @returns 拼接后的查询文本（未清洗）
 */
export function buildKeywordQueryText(input: KeywordQueryInput): string {
  return [input.query, input.topicTitle]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
}

/**
 * @description 构建 FULLTEXT 检索 SQL。
 * 抽成纯函数的目的：让「用户输入只出现在 values、绝不出现在 text」成为一条**可执行断言**，
 * 而不是靠 code review 的记忆。
 * @param filters - 已清洗的查询与过滤条件
 * @returns SQL 文本与按占位符出现顺序排列的参数
 */
export function buildKeywordSearchSql(filters: KeywordSearchFilters): BuiltKeywordSql {
  const clauses: string[] = []
  const scopeValues: unknown[] = []

  if (filters.scope.projectId) {
    clauses.push("  AND e.`projectId` = ?")
    scopeValues.push(filters.scope.projectId)
  } else {
    clauses.push("  AND e.`userId` = ? AND e.`projectId` IS NULL")
    scopeValues.push(filters.scope.userId)
  }

  appendInClause(clauses, scopeValues, "e.`category`", filters.categories)
  appendInClause(clauses, scopeValues, "e.`valueGrade`", filters.valueGrades)

  const match = "MATCH(c.`text`) AGAINST (? IN NATURAL LANGUAGE MODE)"
  const limit = Math.max(1, Math.floor(Number.isFinite(filters.limit) ? filters.limit : 1))

  // LIMIT 内联为整数：它是本模块算出的常量、不来自外部输入，内联可规避部分驱动
  // 对 `LIMIT ?` 的处理差异，且保底经过 Math.floor 归一。
  const text = [
    "SELECT c.`entryId` AS entryId,",
    `       ${match} AS relevance`,
    "FROM `KnowledgeChunk` c",
    "INNER JOIN `KnowledgeEntry` e ON e.`id` = c.`entryId`",
    "WHERE c.`status` = 'completed'",
    "  AND e.`status` = 'active'",
    // ⚠️ MATCH 必须排在 `clauses`（作用域 / 类别 / 分级）**之前**：
    // values 的排列是 [SELECT 的 MATCH, WHERE 的 MATCH, ...scopeValues]，
    // 一旦把作用域挪到 MATCH 前面，查询词会被绑进 `e.projectId = ?`、
    // 项目 id 会被绑进 MATCH —— 两边都是恒假，结果集静默为空且不报错。
    `  AND ${match}`,
    ...clauses,
    // 显式 ORDER BY：官方对「自动按相关度排序」在 JOIN 场景列了前置条件，不赌优化器行为
    "ORDER BY relevance DESC, c.`entryId` ASC",
    `LIMIT ${limit}`,
  ].join("\n")

  const values = [filters.query, filters.query, ...scopeValues]

  // 不变量自检：占位符与参数必须等长。
  // 这条断言存在的理由正是上面那个 bug —— 顺序错位时 SQL 不报错，只是永远返回 0 行，
  // 表现为「混合检索和纯向量一模一样」，极难察觉。宁可抛错，不要静默空结果。
  const placeholders = countPlaceholders(text)
  if (placeholders !== values.length) {
    throw new Error(
      `keyword-query 参数错位：占位符 ${placeholders} 个，参数 ${values.length} 个。SQL:\n${text}`,
    )
  }

  return { text, values }
}

/**
 * @description 按条目聚合块级命中，取该条目的**最高**相关度。
 * 不用求和：长条目块多，求和会让它仅因为「块多」而虚高。
 * @param rows - SQL 返回的 { entryId, relevance }
 * @returns entryId → 最高相关度（仅保留有限正数）
 */
export function bestRelevanceByEntry(
  rows: ReadonlyArray<{ entryId: unknown; relevance: unknown }>,
): Map<string, number> {
  const best = new Map<string, number>()
  for (const row of rows) {
    const entryId = typeof row?.entryId === "string" ? row.entryId : ""
    const score = Number(row?.relevance)
    if (!entryId || !Number.isFinite(score) || score <= 0) continue
    const current = best.get(entryId)
    if (current === undefined || score > current) best.set(entryId, score)
  }
  return best
}

/**
 * @description 统计 SQL 文本中的 `?` 占位符个数（用于断言与 values 等长）
 * @param text - SQL 文本
 * @returns 占位符个数
 */
export function countPlaceholders(text: string): number {
  let count = 0
  for (const char of text) if (char === "?") count++
  return count
}

function appendInClause(
  clauses: string[],
  values: unknown[],
  column: string,
  raw?: string[],
): void {
  const list = normalizeFilterList(raw)
  if (list.length === 0) return
  clauses.push(`  AND ${column} IN (${list.map(() => "?").join(", ")})`)
  values.push(...list)
}

function normalizeFilterList(input?: string[]): string[] {
  if (!Array.isArray(input) || input.length === 0) return []
  const out: string[] = []
  for (const raw of input) {
    const value = typeof raw === "string" ? raw.trim() : ""
    if (!value || out.includes(value)) continue
    out.push(value)
    if (out.length >= MAX_FILTER_VALUES) break
  }
  return out
}
