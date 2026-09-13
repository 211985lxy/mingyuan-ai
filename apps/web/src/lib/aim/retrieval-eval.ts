/**
 * 检索质量基线评估（WP-A5 第一步）。
 *
 * 在动任何"图谱/原子化"投入之前，先能量化当前纯向量 RAG 的检索水位：
 * hitRate@k（期望条目进前 k 的比例）、MRR（期望条目的平均倒数排名）、
 * 关键词命中率（无固定条目 id 时的 smoke 口径）。
 *
 * 纯逻辑可单测；真实打分由 scripts/aim-retrieval-baseline.ts 带真实环境跑。
 * 投入闸门（增量计划 WP-A5）：图谱注入后 hitRate 相对提升 <10% 即止损归档。
 */

export interface RetrievalCase {
  id: string
  query: string
  /** 期望命中的知识条目 id（有明确标注时用） */
  relevantEntryIds?: string[]
  /** 无固定条目 id 时：任一命中条目标题/正文必须包含的关键词（大小写不敏感） */
  mustIncludeKeywords?: string[]
}

export interface RetrievalCaseResult {
  caseId: string
  hitAtK: boolean
  firstRelevantRank: number | null
  reciprocalRank: number
  keywordHit: boolean | null
  pass: boolean
}

export interface RetrievalEvalAggregate {
  totalCases: number
  hitRateAtK: number
  mrr: number
  keywordHitRate: number | null
  passRate: number
  perCase: RetrievalCaseResult[]
}

export interface RetrievalCaseVerdictInput {
  caseId: string
  rankedEntries: Array<{ id: string; title: string; content: string }>
  relevantEntryIds?: string[]
  mustIncludeKeywords?: string[]
}

export function evaluateRetrievalCase(input: RetrievalCaseVerdictInput): RetrievalCaseResult {
  const relevant = new Set(input.relevantEntryIds ?? [])
  let firstRelevantRank: number | null = null
  if (relevant.size > 0) {
    const rank = input.rankedEntries.findIndex((entry) => relevant.has(entry.id))
    firstRelevantRank = rank >= 0 ? rank + 1 : null
  }

  let keywordHit: boolean | null = null
  if (input.mustIncludeKeywords && input.mustIncludeKeywords.length > 0) {
    const haystack = input.rankedEntries
      .map((entry) => `${entry.title}\n${entry.content}`)
      .join("\n")
      .toLowerCase()
    keywordHit = input.mustIncludeKeywords.every((keyword) =>
      haystack.includes(keyword.toLowerCase()),
    )
  }

  const hitAtK = firstRelevantRank !== null || keywordHit === true
  const reciprocalRank = firstRelevantRank !== null ? 1 / firstRelevantRank : 0
  // 通过口径：id 标注或关键词标注，二者有其一则按其判定；两者都给则需同时满足
  let pass: boolean
  if (relevant.size > 0 && keywordHit !== null) pass = firstRelevantRank !== null && keywordHit
  else if (relevant.size > 0) pass = firstRelevantRank !== null
  else pass = keywordHit === true

  return {
    caseId: input.caseId,
    hitAtK,
    firstRelevantRank,
    reciprocalRank,
    keywordHit,
    pass,
  }
}

export function aggregateRetrievalEval(
  cases: RetrievalCase[],
  results: RetrievalCaseResult[],
): RetrievalEvalAggregate {
  const byId = new Map(results.map((result) => [result.caseId, result]))
  const ordered = cases
    .map((item) => byId.get(item.id))
    .filter((result): result is RetrievalCaseResult => Boolean(result))

  const withRelevant = ordered.filter((result) => result.firstRelevantRank !== null || result.keywordHit === null)
  const keywordCases = ordered.filter((result) => result.keywordHit !== null)

  const hitRateAtK = ordered.length > 0 ? ordered.filter((result) => result.hitAtK).length / ordered.length : 0
  const mrr =
    withRelevant.length > 0
      ? withRelevant.reduce((sum, result) => sum + result.reciprocalRank, 0) / withRelevant.length
      : 0
  const keywordHitRate =
    keywordCases.length > 0
      ? keywordCases.filter((result) => result.keywordHit === true).length / keywordCases.length
      : null

  return {
    totalCases: ordered.length,
    hitRateAtK,
    mrr,
    keywordHitRate,
    passRate: ordered.length > 0 ? ordered.filter((result) => result.pass).length / ordered.length : 0,
    perCase: ordered,
  }
}

export async function runRetrievalEval(
  cases: RetrievalCase[],
  topK: number,
  retrieve: (query: string, topK: number) => Promise<Array<{ id: string; title: string; content: string }>>,
): Promise<RetrievalEvalAggregate> {
  const results: RetrievalCaseResult[] = []
  for (const item of cases) {
    const ranked = await retrieve(item.query, topK)
    results.push(
      evaluateRetrievalCase({
        caseId: item.id,
        rankedEntries: ranked,
        relevantEntryIds: item.relevantEntryIds,
        mustIncludeKeywords: item.mustIncludeKeywords,
      }),
    )
  }
  return aggregateRetrievalEval(cases, results)
}
