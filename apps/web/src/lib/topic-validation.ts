import { z } from "zod"

// ─── Valid code sets (must match seed-topic-engine.ts) ──

export const VALID_ELEMENT_CODES = [
  "cost", "authority", "curiosity", "trust", "emotion", "identity",
  "novelty", "practical", "social", "scarcity", "story", "contrast",
] as const

export const VALID_OPENING_CODES = [
  "curiosity_open", "leverage_open", "pain_open", "extreme_open",
  "fear_open", "contrast_open", "benefit_open",
] as const

export const VALID_STRUCTURE_CODES = [
  "suspense_reveal", "contrast_hook", "three_beat_ramp", "proof_first",
  "pain_solution", "pov_walkthrough", "objection_dialogue", "before_after",
  "universal",
] as const

export const VALID_ENDING_CODES = [
  "interactive", "empathy", "slogan", "reversal",
] as const

export const VALID_TOPIC_TYPES = ["人设型", "转化型", "流量型"] as const

export const VALID_TOPIC_SOURCE_TYPES = [
  "个人灵感",
  "客户资料",
  "公司卖点",
  "行业热点",
  "对标参考",
] as const

export const REVIEW_VERDICTS = ["strong", "usable", "observe", "revise"] as const

// ─── 陌生化（Defamiliarization）代码集 ──────────────────────
// 6 类稀缺 + 赋比兴三法，详见 lib/topic-defamiliarization.ts
import { VALID_SCARCITY_CODES, VALID_RHETORIC_CODES } from "@/lib/topic-defamiliarization"
export { VALID_SCARCITY_CODES, VALID_RHETORIC_CODES }

// ─── Zod schemas ────────────────────────────────────────

export const TopicScoreBreakdownSchema = z.object({
  projectFit: z.number().min(0).max(100),
  contentValue: z.number().min(0).max(100),
  viralHook: z.number().min(0).max(100),
  conversionFit: z.number().min(0).max(100),
  feasibility: z.number().min(0).max(100),
})

export const TopicCardSchema = z.object({
  title: z.string().min(2, "标题至少2字").max(20, "标题不超过20字"),
  elementCodes: z
    .array(z.enum(VALID_ELEMENT_CODES))
    .min(1, "至少1个元素")
    .max(3, "最多3个元素"),
  openingTypeCode: z.enum(VALID_OPENING_CODES),
  structureCode: z.enum(VALID_STRUCTURE_CODES),
  rationale: z.string().min(5).max(200).optional(),
  topicType: z.enum(VALID_TOPIC_TYPES).optional(),
  sourceType: z.enum(VALID_TOPIC_SOURCE_TYPES).optional(),
  score: z.number().min(0).max(100).optional(),
  scoreReason: z.string().min(5).max(200).optional(),
  scoreBreakdown: TopicScoreBreakdownSchema.optional(),
  reviewVerdict: z.enum(REVIEW_VERDICTS).optional(),
  revisionAdvice: z.string().min(5).max(200).optional(),
  hook: z.string().min(2).max(200).optional(),
  angle: z.string().min(2).max(300).optional(),
  cta: z.string().min(2).max(200).optional(),
  contentLine: z.string().min(2).max(40).optional(),
  defamiliarization: z
    .object({
      scarcityType: z.enum(VALID_SCARCITY_CODES).optional(),
      rhetoric: z.enum(VALID_RHETORIC_CODES).optional(),
      noveltyScore: z.number().min(0).max(100).optional(),
      note: z.string().min(2).max(200).optional(),
      advice: z.string().min(2).max(200).optional(),
    })
    .optional(),
})

export const TopicCardsSchema = z
  .array(TopicCardSchema)
  .length(4, "必须恰好4个选题")
  .refine(
    (cards) => new Set(cards.map((c) => c.title)).size === cards.length,
    { message: "4个选题标题必须各不相同" },
  )

export const TopicGenerateResponseSchema = z.object({
  topics: TopicCardsSchema,
})

export type TopicCard = z.infer<typeof TopicCardSchema>
export type TopicCards = z.infer<typeof TopicCardsSchema>
