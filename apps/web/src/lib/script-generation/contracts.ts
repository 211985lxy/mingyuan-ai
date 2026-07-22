import { env } from "@/env"
import type { ContentTemplate } from "@/generated/prisma/client"
import type { ApiHotTopicFit, ApiHotTopicInsight } from "@/types/api"
import type { ExpressionBlueprint, TemplateVariable } from "@/types/content-template"

// ─── Model configuration ──────────────────────────────────
// Meta-prompt generation & scoring: Sonnet 4.6 (analytical, structured)
// Script creation: GPT-5.4 (creative, fluent Chinese)
const META_MODEL = env.META_PROMPT_MODEL || "anthropic/claude-sonnet-4.6"
const SCRIPT_MODEL = env.SCRIPT_GENERATION_MODEL || "openai/gpt-5.4"
const SCORE_MODEL = env.SCORE_MODEL || "anthropic/claude-sonnet-4.6"

// Per-step timeout: prevents one slow step from consuming the entire 120s budget
const STEP_TIMEOUT_MS = 30_000 // 30s per LLM call

export interface StructureBlueprint {
  openingPattern: string
  narrativeBeats: string[]
  evidenceSlots: number
  ctaSlot: string
  durationRange: { min: number; max: number }
  pace?: "fast" | "medium" | "slow"
  evidenceDensity?: "low" | "medium" | "high"
  ctaStyle?: "soft" | "direct" | "hard"
}

export interface ScriptDirection {
  openingStrategy: string
  narrativeStyle: string
  coreArgument: string
  endingRequirement: string
}

// ─── Topic context from Phase 13 topic selection ──────────
export interface TopicContext {
  topicSelectionId: string
  topicTitle: string
  elementTags: string[]         // e.g. ["curiosity", "trust"]
  openingTypeCode: string       // e.g. "curiosity_open"
  openingTypeName: string
  openingFormulas: string[]     // formula templates from OpeningType.formulas
  copyStructureCode: string     // e.g. "three_beat_ramp"
  copyStructureName: string
  copyStructureBeats: Array<{ label: string; instruction: string }>
  endingTypeCode: string        // e.g. "interactive"
  endingTypeName: string
  endingGuidance: string
  endingPatterns: string[]
}

// ─── Hot topic fusion context for COPY-04 ─────────────────
export interface HotTopicFusionContext {
  hotTopicTitle: string
  talkingPoints: string[]
}

export interface GenerateScriptCandidatesParams {
  template: Pick<
    ContentTemplate,
    "id" | "displayName" | "description" | "scriptTemplate" | "hookType"
  > & {
    variables: TemplateVariable[]
    expressionBlueprint?: ExpressionBlueprint | null
  }
  inputs: Record<string, string>
  hotTopicContext?: {
    topicId: string
    title: string
    insight: ApiHotTopicInsight
    fit: ApiHotTopicFit
  } | null
  ipProfile?: {
    displayName?: string | null
    nickname?: string | null
    industry?: string | null
    primaryOffer?: string | null
    targetAudience?: string | null
    ipTraits?: string | null
    toneOfVoice?: string | null
    proofPoints?: string | null
    callToAction?: string | null
    promptSnapshot?: string | null
    profileVersion?: number | null
    business?: unknown | null
    persona?: unknown | null
    content?: unknown | null
  } | null
  structure?: {
    displayName: string
    blueprint: StructureBlueprint
  }
  // Phase 14: topic engine context (optional for backward compatibility)
  topicContext?: TopicContext | null
  // Phase 14: hot topic fusion (COPY-04)
  hotTopicFusion?: HotTopicFusionContext | null
  // IP 写作风格档案（用户级全局，由调用方从知识库读取后注入）
  styleProfileBlock?: string | null
  // IP 定位维基/项目定位上下文（由调用方从 IP Wiki 或知识库回退读取后注入）
  ipWikiBlock?: string | null
}

export interface CandidateScore {
  overall: number // 0-100
  structuralCompliance: number
  viewpointClarity: number
  evidenceStrength: number
  ctaClarity: number
  voiceFit: number
  lengthInRange: boolean
  // Phase 14: new scoring dimensions (COPY-05)
  openingFormulaCompliance: number
  endingTypeCompliance: number
}

export interface ScriptGenerationResult {
  candidates: string[]
  scores: CandidateScore[]
  promptText: string
  model: string
  isDegraded: boolean // true if best candidate score < 60
  // Phase 14: hot-topic fusion results (COPY-04)
  hotTopicCandidates?: string[]
  hotTopicScores?: CandidateScore[]
}

const DEFAULT_MODEL = "rule-based-fallback"
