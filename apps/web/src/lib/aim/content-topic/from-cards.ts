/**
 * 从选题卡片映射到内容核验候选，并做只读证据摘录（不得编造原文外引用）。
 */

import type { ContentTopicCandidate } from "./verifier"

export interface TopicCardLike {
  title: string
  hook?: string | null
  angle?: string | null
  rationale?: string | null
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, "")
}

/**
 * 在灵感原文中找与卡片字段有重叠的短句，作为证据引用。
 * 只返回确实出现在 source 中的片段，绝不编造。
 */
export function findSupportingQuotes(
  sourceText: string,
  hints: string[],
  options?: { maxQuotes?: number; minLen?: number },
): string[] {
  const maxQuotes = options?.maxQuotes ?? 2
  const minLen = options?.minLen ?? 6
  const source = sourceText.trim()
  if (!source) return []

  const sentences = source
    .split(/(?<=[。！？\n；;])/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= minLen)

  const normalizedHints = hints
    .map((h) => normalizeWhitespace(h || ""))
    .filter((h) => h.length >= 2)

  const scored = sentences
    .map((sentence) => {
      const norm = normalizeWhitespace(sentence)
      let score = 0
      for (const hint of normalizedHints) {
        if (norm.includes(hint) || hint.includes(norm.slice(0, Math.min(norm.length, 12)))) {
          score += Math.min(hint.length, 24)
        }
        // 共享连续 4+ 字
        for (let i = 0; i <= hint.length - 4; i++) {
          const gram = hint.slice(i, i + 4)
          if (norm.includes(gram)) score += 2
        }
      }
      return { sentence: sentence.slice(0, 120), score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)

  const quotes: string[] = []
  const seen = new Set<string>()
  for (const row of scored) {
    const key = normalizeWhitespace(row.sentence)
    if (seen.has(key)) continue
    seen.add(key)
    quotes.push(row.sentence)
    if (quotes.length >= maxQuotes) break
  }
  return quotes
}

/**
 * @description 将 TopicCard 映射为核验候选（无证据则写信息不足提示）
 */
export function mapTopicCardsToVerifierCandidates(
  cards: TopicCardLike[],
  sourceText: string,
): ContentTopicCandidate[] {
  return cards.map((card) => {
    const hints = [card.title, card.hook, card.angle, card.rationale].filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    )
    const evidenceQuotes = findSupportingQuotes(sourceText, hints)
    return {
      title: card.title,
      angle: card.angle ?? undefined,
      evidenceQuotes,
      insufficientInfoNotes:
        evidenceQuotes.length === 0
          ? ["灵感原文中未定位到可引用证据，需人工补证"]
          : undefined,
      reviewStatus: "pending" as const,
    }
  })
}
