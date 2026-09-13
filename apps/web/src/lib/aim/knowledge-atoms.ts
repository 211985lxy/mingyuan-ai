import { createHash } from "node:crypto"

export const ATOM_KINDS = ["viewpoint", "quote", "fact", "method"] as const
export type AtomKind = (typeof ATOM_KINDS)[number]

export const ATOM_KIND_LABEL: Record<AtomKind, string> = {
  viewpoint: "观点",
  quote: "金句",
  fact: "事实",
  method: "方法",
}

export interface KnowledgeAtomDraft {
  kind: AtomKind
  content: string
  valueGrade: string | null
}

export function atomContentHash(content: string): string {
  return createHash("sha256").update(content.trim(), "utf8").digest("hex")
}

export function splitKnowledgeAtoms(input: {
  title: string
  content: string
  valueGrade: string | null
}): KnowledgeAtomDraft[] {
  const text = `${input.title}\n${input.content}`.trim()
  if (!text) return []
  const chunks = text
    .split(/\n+|。|！|？/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 8 && item.length <= 280)
  const drafts: KnowledgeAtomDraft[] = []
  const seen = new Set<string>()
  for (const chunk of chunks.slice(0, 12)) {
    const kind = classifyAtom(chunk)
    const content = chunk.slice(0, 240)
    const hash = atomContentHash(content)
    if (seen.has(hash)) continue
    seen.add(hash)
    drafts.push({ kind, content, valueGrade: input.valueGrade })
  }
  if (drafts.length === 0) {
    drafts.push({
      kind: "viewpoint",
      content: text.slice(0, 240),
      valueGrade: input.valueGrade,
    })
  }
  return drafts
}

export function classifyAtom(text: string): AtomKind {
  if (/[「『“"].+[」』”"]/.test(text) || /金句|原话|说过/.test(text)) return "quote"
  if (/步骤|方法|怎么做|先.*再|SOP|清单/.test(text)) return "method"
  if (/\d|百分之|数据|调研|统计/.test(text)) return "fact"
  return "viewpoint"
}

export interface RetrievalEvalCase {
  id: string
  query: string
  retrievedIds: string[]
  goldIds: string[]
  citedIds: string[]
}

export interface RetrievalEvalScores {
  hitRate: number
  citationAccuracy: number
  signalToNoise: number
}

export function scoreRetrievalCase(input: RetrievalEvalCase): RetrievalEvalScores {
  const gold = new Set(input.goldIds)
  const retrieved = input.retrievedIds
  const cited = input.citedIds
  const hits = retrieved.filter((id) => gold.has(id)).length
  const citedHits = cited.filter((id) => gold.has(id)).length
  return {
    hitRate: gold.size === 0 ? 0 : hits / gold.size,
    citationAccuracy: cited.length === 0 ? 0 : citedHits / cited.length,
    signalToNoise: retrieved.length === 0 ? 0 : hits / retrieved.length,
  }
}

export function averageRetrievalScores(cases: RetrievalEvalCase[]): RetrievalEvalScores {
  if (cases.length === 0) return { hitRate: 0, citationAccuracy: 0, signalToNoise: 0 }
  const scored = cases.map(scoreRetrievalCase)
  const sum = scored.reduce(
    (acc, item) => ({
      hitRate: acc.hitRate + item.hitRate,
      citationAccuracy: acc.citationAccuracy + item.citationAccuracy,
      signalToNoise: acc.signalToNoise + item.signalToNoise,
    }),
    { hitRate: 0, citationAccuracy: 0, signalToNoise: 0 },
  )
  return {
    hitRate: sum.hitRate / cases.length,
    citationAccuracy: sum.citationAccuracy / cases.length,
    signalToNoise: sum.signalToNoise / cases.length,
  }
}

export function graphHopLift(baseline: RetrievalEvalScores, withGraph: RetrievalEvalScores): number {
  if (baseline.hitRate <= 0) return withGraph.hitRate > 0 ? 1 : 0
  return (withGraph.hitRate - baseline.hitRate) / baseline.hitRate
}
