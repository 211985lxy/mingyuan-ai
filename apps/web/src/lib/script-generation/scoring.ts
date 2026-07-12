import { LLMClient } from "@/lib/llm"
import type { CandidateScore, GenerateScriptCandidatesParams } from "./contracts"
import { SCORE_MODEL } from "./models"
import { buildScoringPrompt } from "./scoring-context"

export interface ResolvedScoringFields {
  displayName: string
  industry: string
  ipTraits: string
  toneOfVoice: string
  callToAction: string
  proofPoints: string
  targetAudience: string
  nickname: string
}

export function resolveScriptScoringFields(
  ipProfile: GenerateScriptCandidatesParams["ipProfile"]
): ResolvedScoringFields {
  if (!ipProfile) {
    return { displayName: "", nickname: "", industry: "", ipTraits: "", toneOfVoice: "", callToAction: "", proofPoints: "", targetAudience: "" }
  }
  return {
    displayName: ipProfile.displayName || "",
    nickname: ipProfile.nickname || "",
    industry: ipProfile.industry || "",
    ipTraits: ipProfile.ipTraits || "",
    toneOfVoice: ipProfile.toneOfVoice || "",
    callToAction: ipProfile.callToAction || "",
    proofPoints: ipProfile.proofPoints || "",
    targetAudience: ipProfile.targetAudience || "",
  }
}

// ─── Step 3: AI-based scoring (COPY-05 upgrade) ────────────

export async function scoreWithAI(
  llm: LLMClient,
  candidates: string[],
  params: GenerateScriptCandidatesParams,
): Promise<CandidateScore[]> {
  try {
    const result = await llm.complete({
      model: SCORE_MODEL,
      messages: [
        {
          role: "system",
          content: "你是一位严格的短视频文案质量审核专家。只输出纯 JSON，不添加任何说明。",
        },
        { role: "user", content: buildScoringPrompt(candidates, params, resolveScriptScoringFields(params.ipProfile)) },
      ],
      temperature: 0.2,
      maxTokens: 800,
      responseFormat: { type: "json_object" },
    })

    return parseAIScores(result.content, candidates.length)
  } catch {
    // Fallback to keyword-based scoring if AI scoring fails
    return candidates.map((c) => scoreWithKeywords(c, params))
  }
}

function parseAIScores(content: string, count: number): CandidateScore[] {
  const raw = content.trim()
  // Try multiple extraction strategies
  const attempts = [
    raw,
    raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim(),
    (() => {
      const s = raw.indexOf("["), e = raw.lastIndexOf("]")
      return s !== -1 && e > s ? raw.slice(s, e + 1) : ""
    })(),
    (() => {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}")
      return s !== -1 && e > s ? `[${raw.slice(s, e + 1)}]` : ""
    })(),
  ]

  for (const attempt of attempts) {
    if (!attempt) continue
    try {
      const parsed = JSON.parse(attempt)
      const arr = Array.isArray(parsed) ? parsed : parsed?.scores ?? [parsed]
      if (arr.length >= count) {
        return arr.slice(0, count).map((s: Record<string, number>) => ({
          overall: clamp(s.overall ?? 50),
          structuralCompliance: clamp(s.structuralCompliance ?? 50),
          viewpointClarity: clamp(s.briefCoverage ?? 50),
          evidenceStrength: clamp(s.evidenceStrength ?? 50),
          ctaClarity: clamp(s.ctaClarity ?? 50),
          voiceFit: clamp(s.voiceFit ?? 50),
          lengthInRange: (s.lengthOk ?? 1) === 1,
          // COPY-05: new dimensions (default 50 if not returned by AI)
          openingFormulaCompliance: clamp(s.openingFormulaCompliance ?? 50),
          endingTypeCompliance: clamp(s.endingTypeCompliance ?? 50),
        }))
      }
    } catch {
      // try next
    }
  }

  // Return default scores if parsing fails
  return Array.from({ length: count }, () => ({
    overall: 50,
    structuralCompliance: 50,
    viewpointClarity: 50,
    evidenceStrength: 50,
    ctaClarity: 50,
    voiceFit: 50,
    lengthInRange: true,
    openingFormulaCompliance: 50,
    endingTypeCompliance: 50,
  }))
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

// ─── Fallback: keyword-based scoring ───────────────────────

function extractKeywords(text: string | null | undefined): string[] {
  if (!text) return []
  return text.split(/[\s,，、/;；|]+/).filter((w) => w.length >= 2)
}

export function scoreWithKeywords(
  candidate: string,
  params: GenerateScriptCandidatesParams,
): CandidateScore {
  const resolved = resolveScriptScoringFields(params.ipProfile)
  const structuralCompliance = scoreStructure(candidate, params)
  const briefCoverage = scoreBrief(candidate, params.inputs)
  const evidenceStrength = scoreEvidence(candidate, resolved.proofPoints)
  const ctaClarity = scoreCta(candidate, params, resolved.callToAction)
  const voiceFit = scoreVoice(candidate, resolved)
  const lengthInRange = isLengthInRange(candidate, params)
  const openingFormulaCompliance = scoreOpening(candidate, params)
  const endingTypeCompliance = scoreEnding(candidate, params)
  return {
    overall: calculateOverall({ structuralCompliance, briefCoverage, evidenceStrength, ctaClarity, voiceFit, lengthInRange, openingFormulaCompliance, endingTypeCompliance }, Boolean(params.structure), Boolean(params.topicContext)),
    structuralCompliance,
    viewpointClarity: briefCoverage,
    evidenceStrength,
    ctaClarity,
    voiceFit,
    lengthInRange,
    openingFormulaCompliance,
    endingTypeCompliance,
  }
}

function scoreStructure(candidate: string, params: GenerateScriptCandidatesParams): number {
  const beats = params.structure?.blueprint.narrativeBeats
  if (!beats?.length) return 60
  return Math.round((beats.filter((beat) => extractKeywords(beat).some((keyword) => candidate.includes(keyword))).length / beats.length) * 100)
}

function scoreBrief(candidate: string, inputs: Record<string, string>): number {
  const values = Object.values(inputs).filter((value) => value.trim().length >= 2)
  if (!values.length) return 60
  return Math.round((values.filter((value) => extractKeywords(value).some((keyword) => candidate.includes(keyword))).length / values.length) * 100)
}

function scoreEvidence(candidate: string, proofPoints: string): number {
  const keywords = extractKeywords(proofPoints)
  const matched = keywords.filter((keyword) => candidate.includes(keyword)).length
  const base = keywords.length ? Math.min(100, Math.round((matched / Math.max(1, keywords.length)) * 100)) : 50
  return (candidate.match(/\d+/g) || []).length >= 2 ? Math.min(100, base + 25) : base
}

function scoreCta(candidate: string, params: GenerateScriptCandidatesParams, callToAction: string): number {
  const keywords = [params.structure?.blueprint.ctaSlot, callToAction].filter(Boolean).flatMap((value) => extractKeywords(value as string))
  if (!keywords.length) return 40
  const lastPart = candidate.slice(Math.floor(candidate.length * 0.6))
  return Math.min(100, Math.round((keywords.filter((keyword) => lastPart.includes(keyword)).length / Math.max(1, keywords.length)) * 100))
}

function scoreVoice(candidate: string, resolved: ResolvedScoringFields): number {
  const keywords = [...extractKeywords(resolved.toneOfVoice), ...extractKeywords(resolved.ipTraits)]
  const base = keywords.length ? Math.min(100, Math.round((keywords.filter((keyword) => candidate.includes(keyword)).length / Math.max(1, keywords.length)) * 100)) : 50
  return resolved.displayName && candidate.includes(resolved.displayName) ? Math.min(100, base + 20) : base
}

function isLengthInRange(candidate: string, params: GenerateScriptCandidatesParams): boolean {
  if (!params.structure) return true
  const { min, max } = params.structure.blueprint.durationRange
  return candidate.length >= min * 3 && candidate.length <= max * 4
}

function scoreOpening(candidate: string, params: GenerateScriptCandidatesParams): number {
  const formulas = params.topicContext?.openingFormulas.flatMap((formula) => extractKeywords(formula)) ?? []
  if (!formulas.length) return 50
  const opening = candidate.slice(0, Math.min(80, Math.floor(candidate.length * 0.2)))
  return Math.min(100, Math.round((formulas.filter((keyword) => opening.includes(keyword)).length / Math.max(1, formulas.length)) * 100))
}

function scoreEnding(candidate: string, params: GenerateScriptCandidatesParams): number {
  const topic = params.topicContext
  if (!topic) return 50
  const keywords = [...extractKeywords(topic.endingGuidance), ...topic.endingPatterns.flatMap((pattern) => extractKeywords(pattern))]
  if (!keywords.length) return 50
  const ending = candidate.slice(Math.floor(candidate.length * 0.7))
  return Math.min(100, Math.round((keywords.filter((keyword) => ending.includes(keyword)).length / Math.max(1, keywords.length)) * 100))
}

type KeywordScoreParts = {
  structuralCompliance: number
  briefCoverage: number
  evidenceStrength: number
  ctaClarity: number
  voiceFit: number
  lengthInRange: boolean
  openingFormulaCompliance: number
  endingTypeCompliance: number
}

function calculateOverall(
  score: KeywordScoreParts,
  hasStructure: boolean,
  hasTopicContext: boolean,
): number {
  if (hasTopicContext) return Math.round(score.structuralCompliance * (hasStructure ? 0.15 : 0.03) + score.briefCoverage * 0.20 + score.evidenceStrength * 0.12 + score.ctaClarity * 0.12 + score.voiceFit * 0.11 + score.openingFormulaCompliance * 0.12 + score.endingTypeCompliance * 0.08 + (score.lengthInRange ? 10 : 0))
  return Math.round(score.structuralCompliance * (hasStructure ? 0.20 : 0.05) + score.briefCoverage * 0.25 + score.evidenceStrength * 0.15 + score.ctaClarity * 0.15 + score.voiceFit * 0.15 + (score.lengthInRange ? 10 : 0))
}
