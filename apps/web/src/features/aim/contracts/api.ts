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
}).strict()

export const aimEvolveBodySchema = z.object({
  projectId: id,
  agentId: z.string().max(80).optional(),
  persist: z.boolean().optional(),
  messages: z.array(chatMessageSchema).min(1).max(50),
}).strict()

export const aimEvolveStyleBodySchema = z.object({
  projectId: optionalId,
  messages: z.array(chatMessageSchema).min(1).max(50),
}).strict()

export type AimChatBody = z.infer<typeof aimChatBodySchema>
export type AimGenerateBody = z.infer<typeof aimGenerateBodySchema>
export type AimWorkflowBriefBody = z.infer<typeof aimWorkflowBriefBodySchema>

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
