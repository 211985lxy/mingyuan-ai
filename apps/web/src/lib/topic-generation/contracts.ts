import type { TopicElement } from "@/generated/prisma/client"
import type { TopicCard } from "@/lib/topic-validation"
import type { DerivationStrategy } from "@/lib/topic-element-logic"

export type RecommendationMode = "normal" | "daily" | "weekly"

export interface TopicGenerationInput {
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
    profileVersion?: number | null
    business?: unknown | null
    persona?: unknown | null
    content?: unknown | null
    promptSnapshot?: string | null
  } | null
  elements: Pick<TopicElement, "code" | "name" | "typeLabel" | "description">[]
  topicSources?: Array<{ category: string; title: string; content: string }>
  recommendationMode?: RecommendationMode
  forcedElementCodes?: string[]
  recentElementSets?: string[][]
  recentTitles?: string[]
  refreshCount?: number
  contentThemes?: Array<{ name: string; ratio: number }>
}

export type TopicGenerationResult =
  | {
      success: true
      cards: TopicCard[]
      elementCodes: string[]
      promptText: string
      model: string
      strategy: DerivationStrategy
    }
  | {
      success: false
      error: string
    }
