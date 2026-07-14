export type TemplateStatus = "draft" | "published" | "archived"

export type ContentType =
  | "problem_solution"
  | "tutorial"
  | "listicle"
  | "hero_offer"
  | "social_proof"
  | "testimonial"
  | "routine_embed"
  | "comparison"
  | "debunk"
  | "faq_reply"
  | "before_after"
  | "behind_scenes"
  | "buying_guide"
  | "trend_bridge"
  | "case_breakdown"
  | "founder_opinion"
  | "product_intro"
  | "promotion"
  | "knowledge"
  | "story"

export type HookType =
  | "price"
  | "authority"
  | "audience"
  | "pain"
  | "effect"
  | "curiosity"
  | "question"
  | "reverse"
  | "emotion"

export interface TemplateVariable {
  key: string
  label: string
  placeholder: string
  required: boolean
  type: "text" | "textarea" | "select"
  options?: string[]
}

export type ExpressionProofBurden = "light" | "medium" | "strong"

export type ExpressionCtaStyle =
  | "consult"
  | "save"
  | "buy"
  | "follow"
  | "comment"

export interface ExpressionBlueprint {
  argumentPattern: string
  proofBurden: ExpressionProofBurden
  ctaStyle: ExpressionCtaStyle
  hotTopicModes: string[]
  recommendedStructures: string[]
}

export interface SeasonalEvent {
  id: string
  startDate: string // MM-DD format
  endDate: string // MM-DD format
}

export interface HotTopic {
  id: string
  rank: number
  title: string
  hotValue: number
  label: "normal" | "new" | "hot" | "recommended"
  videoCount: number
  coverUrl: string | null
  douyinSearchUrl: string
  fetchedAt: string
  recommendedTemplates?: { id: string; name: string }[]
}

export type AdminRole = "editor" | "admin"

// State machine: allowed transitions
export const TEMPLATE_TRANSITIONS: Record<TemplateStatus, TemplateStatus[]> = {
  draft: ["published"],
  published: ["archived"],
  archived: ["published"],
}
