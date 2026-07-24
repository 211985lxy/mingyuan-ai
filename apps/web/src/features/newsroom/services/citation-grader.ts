import type { SourceBrief } from "@/features/newsroom/contracts"

const SAMPLE_CITE_PATTERN = /\[样本\s*(\d+)\]/g

/** 从正文/METHOD_NOTE 提取 [样本N] 引用的序号 */
export function extractSampleCitationIndexes(text: string): number[] {
  const found = new Set<number>()
  for (const match of text.matchAll(SAMPLE_CITE_PATTERN)) {
    const n = Number(match[1])
    if (Number.isFinite(n) && n > 0) found.add(n)
  }
  return [...found].sort((a, b) => a - b)
}

export function allowedSampleIndexes(brief: SourceBrief): Set<number> {
  return new Set(brief.samples.map((s) => s.index))
}

export function gradeSampleCitations(input: {
  content: string
  brief: SourceBrief
}): {
  ok: boolean
  cited: number[]
  illegal: number[]
  missingRequired: number[]
} {
  const cited = extractSampleCitationIndexes(input.content)
  const allowed = allowedSampleIndexes(input.brief)
  const illegal = cited.filter((n) => !allowed.has(n))

  const mustIndexes = input.brief.mustCite
    .map((id) => input.brief.samples.find((s) => s.id === id)?.index)
    .filter((n): n is number => typeof n === "number")

  const citedSet = new Set(cited)
  const missingRequired = input.brief.groundingPolicy.requireSampleCitation
    ? mustIndexes.filter((n) => !citedSet.has(n))
    : []

  // 至少有一条合法引用，且无非法 id
  const hasAnyLegal = cited.some((n) => allowed.has(n))
  const ok =
    illegal.length === 0
    && (!input.brief.groundingPolicy.requireSampleCitation || hasAnyLegal)
    && missingRequired.length === 0

  return { ok, cited, illegal, missingRequired }
}
