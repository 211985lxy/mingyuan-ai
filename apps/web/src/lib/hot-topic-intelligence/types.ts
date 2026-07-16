import type { ExpressionBlueprint, HotTopic } from "@/types/content-template"
import type { ApiHotTopicFit, ApiHotTopicInsight } from "@/types/api"

export const INSIGHT_FAILURE_COOLDOWN_MS = 10 * 60 * 1000
export const SINGLE_FLIGHT_LOCK_TTL_SECONDS = 120
export const SINGLE_FLIGHT_WAIT_MS = 45000
export const SINGLE_FLIGHT_POLL_MS = 1000
export const SEARCH_LIMIT = 6
export const SEARCH_TIMEOUT_MS = 15000
export const SEARCH_RETRY_LIMIT = 3
export const MIN_EVIDENCE_COUNT = 2

export type TopicRow = {
  id: string
  sentenceId: string
  word: string
  hotValue: number
  position: number
  label: number
  videoCount: number
  coverUrl: string | null
  eventTime: Date
  fetchedAt: Date
  batchId: string
  searchSnapshot: unknown
  insightStatus: string
  insightJson: unknown
  insightError: string | null
  insightUpdatedAt: Date | null
}

export interface SearchEvidence {
  title: string
  snippet: string
  url: string
  publishedAt: string | null
}

export interface FitInput {
  topicTitle: string
  insight: ApiHotTopicInsight
  ipProfile?: {
    id?: string
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
    // v2 fields (JSON columns, validated at runtime)
    profileVersion?: number | null
    business?: Record<string, unknown> | null
    persona?: Record<string, unknown> | null
    content?: Record<string, unknown> | null
  }
  template: {
    id: string
    displayName: string
    description: string | null
    hookType: string | null
    scriptTemplate: string
    expressionBlueprint?: ExpressionBlueprint | null
  }
  structure: {
    id: string
    displayName: string
    blueprint: {
      openingPattern: string
      narrativeBeats: string[]
      evidenceSlots: number
      ctaSlot: string
      durationRange: { min: number; max: number }
    }
  }
  inputs: Record<string, string>
}

export class HotTopicIntelligenceError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 500) {
    super(message)
    this.name = "HotTopicIntelligenceError"
    this.code = code
    this.status = status
  }
}
