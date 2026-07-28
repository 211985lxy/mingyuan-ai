import { z } from "zod"

const id = z.string().trim().min(1).max(80)
const optionalId = id.optional()
const shortText = z.string().max(2_000)
const longText = z.string().max(100_000)
// ADR-002：命名方法论 profile id（MVP 最多 1 个主方法论）
const methodologyProfileIdsSchema = z.array(z.string().trim().min(1).max(80)).max(1).optional()

const confirmedBriefSchema = z.object({
  goal: z.string().max(500).optional(),
  targetCustomer: z.string().max(500).optional(),
  realProblem: z.string().max(500).optional(),
  contentTask: z.enum([
    "吸引目标客户",
    "建立专业信任",
    "展示真实案例",
    "筛选不适合客户",
    "解释问题与方法",
    "推动咨询行动",
  ]).optional(),
  mustKeep: z.string().max(500).optional(),
  avoid: z.string().max(500).optional(),
  desiredAction: z.enum(["评论", "私信", "领取资料", "预约诊断", "进一步咨询"]).optional(),
  suggestedFormat: z.string().max(100).optional(),
  userSupplement: z.string().max(1_000).optional(),
}).strict()

export const aimWorkflowBriefBodySchema = z.object({
  stage: z.enum(["direction", "content", "publish", "results"]),
  projectId: optionalId,
  sourceGenerationId: optionalId,
  goal: z.string().max(500).optional(),
  confirmed: confirmedBriefSchema.optional(),
}).strict()

const chatContentPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: longText }).strict(),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({ url: z.string().max(2_000_000) }).strict(),
  }).strict(),
])

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([longText, z.array(chatContentPartSchema).min(1).max(20)]),
}).strict()

const editorContextSchema = z.object({
  action: z.string().min(1).max(80),
  referenceSelection: z.string().max(30_000).optional(),
  draftSelection: z.string().max(30_000).optional(),
  draftText: z.string().max(100_000).optional(),
}).strict()

export const aimChatBodySchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
  agentId: z.string().max(80).optional(),
  projectId: optionalId,
  toolAction: z.enum([
    "import_lark_topics",
    "import_lark_project_data",
    "import_lark_archive_data",
    "export_lark_generation",
  ]).optional(),
  resultId: optionalId,
  stream: z.boolean().optional(),
  editorContext: editorContextSchema.optional(),
  agentModule: z.enum(["social", "longform", "free", "moments"]).optional(),
  writerModule: z.enum(["social", "longform", "free", "moments"]).optional(),
  methodologyProfileIds: methodologyProfileIdsSchema,
}).strict()

const contentFormatSchema = z.enum([
  "video_script",
  "wechat_article",
  "moments_post",
  "community_message",
  "shooting_brief",
  "raw_copy",
  "koubo_script",
  "xiaohongshu_post",
])

export const aimGenerateBodySchema = z.object({
  agentId: z.string().max(80).optional(),
  rawInput: longText,
  targetFormats: z.array(contentFormatSchema).max(8).optional(),
  taskType: z.enum(["polish_copy", "write_script", "quality_check", "repurpose"]).optional(),
  projectId: optionalId,
  videoCopyExtractionId: optionalId,
  topicTitle: shortText.optional(),
  topicRationale: shortText.optional(),
  topicType: z.string().max(80).optional(),
  hotTopic: shortText.optional(),
  polishInstruction: z.string().max(20_000).optional(),
  useMarketViralVideos: z.boolean().optional(),
  existingGenerationId: optionalId,
  topicSelectionId: optionalId,
  selectedTopicIndex: z.number().int().min(0).max(20).optional(),
  workflow: aimWorkflowBriefBodySchema.optional(),
  agentModule: z.enum(["social", "longform", "free", "moments"]).optional(),
  writerModule: z.enum(["social", "longform", "free", "moments"]).optional(),
  traceId: optionalId,
  methodologyProfileIds: methodologyProfileIdsSchema,
  /** 用户确认的本轮意图（生成前确认条回传；有则优先于规则推断） */
  confirmedTurnIntent: z.object({
    summary: z.string().min(1).max(500),
    action: z.enum(["create", "local_edit", "rewrite", "review", "position", "chat"]),
    scope: z.enum(["opening", "title", "ending", "cta", "full", "unspecified"]),
    deliverable: z.string().min(1).max(120),
    keep: z.array(z.string().max(200)).max(8).default([]),
    avoid: z.array(z.string().max(200)).max(8).default([]),
    archiveGaps: z.array(z.string().max(300)).max(4).default([]),
    userSupplement: z.string().max(500).optional(),
  }).strict().optional(),
  /** 发布质检官：review_report=只出报告；editor_revise=改稿终稿 */
  reviewMode: z.enum(["review_report", "editor_revise"]).optional(),
}).strict()

export const aimEvolveBodySchema = z.object({
  projectId: id,
  agentId: z.string().max(80).optional(),
  persist: z.boolean().optional(),
  messages: z.array(chatMessageSchema).min(1).max(50),
}).strict()

const styleDimField = z.string().max(500).optional()

/** 写作风格八维增量（preview 返回 / commit 提交） */
export const styleProfileDeltaSchema = z.object({
  cognitivePattern: z.object({
    entry: styleDimField,
    reasoning: styleDimField,
    attitude: styleDimField,
  }).strict(),
  emotionalTexture: z.object({
    tone: styleDimField,
    humor: styleDimField,
  }).strict(),
  structuralDna: z.object({
    hook: styleDimField,
    twist: styleDimField,
    ending: styleDimField,
  }).strict(),
  microLinguistics: z.object({
    sentence: styleDimField,
    catchphrase: styleDimField,
    metaphor: styleDimField,
  }).strict(),
  coreValues: z.object({
    beliefs: styleDimField,
    supports: styleDimField,
    opposes: styleDimField,
  }).strict(),
  decisionHeuristics: z.object({
    priorities: styleDimField,
    tradeoffs: styleDimField,
  }).strict(),
  antiPatterns: z.object({
    avoids: styleDimField,
    forbiddenTone: styleDimField,
  }).strict(),
  honestLimits: z.object({
    uncertainty: styleDimField,
    requiresEvidence: styleDimField,
  }).strict(),
  evidence: z.string().min(1).max(2_000),
  confidence: z.enum(["confirmed", "user_claim", "pending_verify"]),
}).strict()

export const styleSampleSchema = z.object({
  content: z.string().trim().min(1).max(50_000),
  /** 核心/普通样本标签，仅写入证据语境，不做权重计算 */
  label: z.enum(["core", "normal"]).optional(),
}).strict()

/**
 * 写作风格沉淀：
 * - 无 operation：旧路径，messages → 提取 + 写库
 * - preview：samples 或 messages → 只返回候选，不写库
 * - commit：已确认 delta → 合并写库
 */
export const aimEvolveStyleBodySchema = z.object({
  projectId: optionalId,
  operation: z.enum(["preview", "commit"]).optional(),
  messages: z.array(chatMessageSchema).min(1).max(50).optional(),
  samples: z.array(styleSampleSchema).min(1).max(10).optional(),
  delta: styleProfileDeltaSchema.optional(),
}).strict().superRefine((body, ctx) => {
  if (body.operation === "commit") {
    if (!body.delta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "确认写入需要已预览确认的风格候选（delta）",
        path: ["delta"],
      })
    }
    return
  }
  if (body.operation === "preview") {
    const hasSamples = (body.samples?.length ?? 0) > 0
    const hasMessages = (body.messages?.length ?? 0) > 0
    if (!hasSamples && !hasMessages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "风格预览需要 1—10 篇样本，或提供对话消息",
        path: ["samples"],
      })
    }
    return
  }
  // 旧调用：必须带 messages
  if (!body.messages || body.messages.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "风格沉淀需要对话消息",
      path: ["messages"],
    })
  }
})

export type AimChatBody = z.infer<typeof aimChatBodySchema>
export type AimGenerateBody = z.infer<typeof aimGenerateBodySchema>
export type AimWorkflowBriefBody = z.infer<typeof aimWorkflowBriefBodySchema>
export type AimEvolveStyleBody = z.infer<typeof aimEvolveStyleBodySchema>
export type StyleProfileDeltaBody = z.infer<typeof styleProfileDeltaSchema>

export const aimHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  projectId: optionalId,
  agentId: z.string().max(80).optional(),
  scope: z.enum(["pending"]).optional(),
  includeTotal: z.enum(["true", "false"]).optional(),
}).strict()

export const aimRunEventBodySchema = z.object({
  event: z.enum([
    "copied",
    "revised",
    "accepted",
    "edited",
    "published",
    "retrospected",
    "partially_satisfied",
    "rewrite_requested",
    "rejected",
    "abandoned",
    "final_disposition",
    "accepted_first_pass",
    "accepted_after_edit",
  ]),
  reason: z.enum([
    "fact_inaccurate",
    "tone_mismatch",
    "structure_mismatch",
    "too_generic",
    "conversion_weak",
    "missing_evidence",
    "other",
  ]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict()
