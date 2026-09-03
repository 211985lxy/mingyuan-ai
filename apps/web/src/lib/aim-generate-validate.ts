import type { ContentFormat, AimTaskType } from "@/lib/aim-generator"
import { normalizeRequestedCopyStudioModule, supportsCopyStudioModule, type CopyStudioModule } from "@/lib/copy-studio"
import { VALID_TOPIC_TYPES } from "@/lib/topic-validation"
import { parseWorkflowBriefRequest } from "@/lib/aim-workflow"
import { normalizeConfirmedTurnIntent, type AimTurnIntent } from "@/lib/aim-turn-intent"
import { agentAllowsContentModeSelector } from "@/lib/aim/agent-capabilities"
import type { AimMethodologySignal } from "@/lib/aim-agent-guides"
import { contentSourceEnvelopeSchema, type AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"

const VALID_METHODOLOGY_SIGNALS = new Set<AimMethodologySignal>([
  "ip_copywriting",
  "viral_structure",
  "event_storytelling",
])

const VALID_FORMATS = new Set([
  "video_script",
  "wechat_article",
  "moments_post",
  "community_message",
  "shooting_brief",
  "raw_copy",
  "koubo_script",
  "xiaohongshu_post",
])

const VALID_TASK_TYPES = new Set<string>([
  "polish_copy",
  "write_script",
  "quality_check",
  "repurpose",
])

const TASK_DEFAULT_FORMATS: Record<string, ContentFormat[]> = {
  polish_copy: ["raw_copy"],
  write_script: ["video_script", "moments_post", "community_message"],
  quality_check: [],
  repurpose: ["moments_post", "wechat_article"],
}

function normalizeContentFormat(format: unknown): unknown {
  return format === "koubo_script" ? "video_script" : format
}

export interface ParseGenerateBodyResult {
  agentId: string | undefined
  rawInput: string
  taskType: AimTaskType | undefined
  targetFormats: ContentFormat[]
  projectId: string
  videoCopyExtractionId: string | undefined
  topicTitle: string | undefined
  topicRationale: string | undefined
  topicType: string | undefined
  hotTopic: string | undefined
  polishInstruction: string | undefined
  useMarketViralVideos: boolean | undefined
  existingGenerationId: string | undefined
  topicSelectionId: string | undefined
  selectedTopicIndex: number | undefined
  workflow: ReturnType<typeof parseWorkflowBriefRequest> | undefined
  agentModule: CopyStudioModule | undefined
  writerModule: CopyStudioModule | undefined
  methodologyProfileIds: string[] | undefined
  confirmedTurnIntent: AimTurnIntent | undefined
  /** 发布质检官模式：报告 / 改稿 */
  reviewMode: "review_report" | "editor_revise" | undefined
  /** 写作风格显式覆盖：true=强制启用 false=强制禁用 */
  useStyleProfileOverride: boolean | undefined
  /** 方法论类技能一次性透传：本轮按需注入对应方法论/爆款结构 */
  activeMethodologySignals: AimMethodologySignal[] | undefined
  sourceEnvelope: AimContentSourceEnvelope | undefined
  contentTaskCard?: {
    audience?: string
    pain?: string
    core_claim?: string
    case_refs?: string[]
    product_link?: string
    platform_angles?: Record<string, string>
  }
}

/**
 * 从请求体解析 methodologyProfileIds（ADR-002）。
 * MVP 最多 1 个；接受字符串数组，逐项 trim + 过滤，去重。
 * 供 generate / chat / scripts 三入口复用，保证解析口径一致。
 */
export function parseMethodologyProfileIds(body: Record<string, unknown>): string[] | undefined {
  const raw = body.methodologyProfileIds
  if (!Array.isArray(raw)) return undefined
  const ids = raw
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .slice(0, 1) // MVP：最多 1 个主方法论
  return ids.length > 0 ? Array.from(new Set(ids)) : undefined
}

/**
 * 从请求体解析 activeMethodologySignals：本轮按需注入的方法论/爆款结构信号。
 * 只接受合法枚举值，过滤非法项；去重，最多 4 个。供 generate / chat 入口复用。
 */
export function parseActiveMethodologySignals(body: Record<string, unknown>): AimMethodologySignal[] | undefined {
  const raw = body.activeMethodologySignals
  if (!Array.isArray(raw)) return undefined
  const signals = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item): item is AimMethodologySignal => VALID_METHODOLOGY_SIGNALS.has(item as AimMethodologySignal))
    .slice(0, 4)
  return signals.length > 0 ? Array.from(new Set(signals)) : undefined
}

/**
 * @description 解析生成请求体
 * @param body - 请求体对象
 * @returns 解析后的生成参数
 */
export function parseGenerateBody(body: Record<string, unknown>): ParseGenerateBodyResult {
  const rawInput = typeof body.rawInput === "string" ? body.rawInput.trim() : ""
  const agentId = typeof body.agentId === "string" ? body.agentId : undefined

  // 解析 taskType
  const taskType: AimTaskType | undefined =
    typeof body.taskType === "string" && VALID_TASK_TYPES.has(body.taskType)
      ? (body.taskType as AimTaskType)
      : undefined

  // 解析 targetFormats：优先用显式传入的，否则根据 taskType 推断
  let targetFormats = Array.isArray(body.targetFormats)
    ? Array.from(new Set(body.targetFormats
        .map(normalizeContentFormat)
        .filter((format: unknown): format is ContentFormat =>
          typeof format === "string" && VALID_FORMATS.has(format)
        )))
    : []

  if (targetFormats.length === 0 && taskType) {
    targetFormats = TASK_DEFAULT_FORMATS[taskType] || []
  }

  // 解析 topicType（复用定位策划官的内容类型：人设型/转化型/流量型）
  const topicType: string | undefined =
    typeof body.topicType === "string" &&
    (VALID_TOPIC_TYPES as readonly string[]).includes(body.topicType)
      ? body.topicType
      : undefined

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
  const agentModule = normalizeRequestedCopyStudioModule(body.agentModule, body.writerModule)
  const sourceEnvelopeResult = contentSourceEnvelopeSchema.safeParse(body.sourceEnvelope)
  if (body.sourceEnvelope && !sourceEnvelopeResult.success) {
    // 不再无声丢素材：信封校验失败要留下证据（单字段>10万字符/轮数>20/材料>8条等）
    console.warn("[aim-generate] sourceEnvelope 校验失败，参考材料/当前作品将不可见", {
      issues: sourceEnvelopeResult.error.issues.slice(0, 3).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    })
  }

  return {
    agentId,
    rawInput,
    taskType,
    targetFormats,
    projectId,
    videoCopyExtractionId: typeof body.videoCopyExtractionId === "string" ? body.videoCopyExtractionId.trim() || undefined : undefined,
    topicTitle: typeof body.topicTitle === "string" ? body.topicTitle : undefined,
    topicRationale: typeof body.topicRationale === "string" ? body.topicRationale : undefined,
    topicType,
    hotTopic: typeof body.hotTopic === "string" ? body.hotTopic : undefined,
    polishInstruction: typeof body.polishInstruction === "string" ? body.polishInstruction : undefined,
    useMarketViralVideos:
      typeof body.useMarketViralVideos === "boolean" ? body.useMarketViralVideos : undefined,
    existingGenerationId: typeof body.existingGenerationId === "string" ? body.existingGenerationId.trim() || undefined : undefined,
    topicSelectionId: typeof body.topicSelectionId === "string" ? body.topicSelectionId.trim() || undefined : undefined,
    selectedTopicIndex:
      typeof body.selectedTopicIndex === "number" && Number.isInteger(body.selectedTopicIndex) && body.selectedTopicIndex >= 0
        ? body.selectedTopicIndex
        : undefined,
    workflow: parseWorkflowBriefRequest(body.workflow) || undefined,
    agentModule,
    writerModule: agentModule,
    methodologyProfileIds: parseMethodologyProfileIds(body),
    activeMethodologySignals: parseActiveMethodologySignals(body),
    confirmedTurnIntent: normalizeConfirmedTurnIntent(body.confirmedTurnIntent) || undefined,
    reviewMode:
      body.reviewMode === "editor_revise" || body.reviewMode === "review_report"
        ? body.reviewMode
        : undefined,
    useStyleProfileOverride:
      typeof body.useStyleProfileOverride === "boolean"
        ? body.useStyleProfileOverride
        : undefined,
    sourceEnvelope: sourceEnvelopeResult.success ? sourceEnvelopeResult.data : undefined,
    contentTaskCard: normalizeContentTaskCard(body.contentTaskCard),
  }
}



/**
 * 从请求体解析内容任务卡：
 *  - 非对象或 null → undefined
 *  - core_claim 为空串或非字符串 → 整体视为未启用（返回 undefined）
 *  - case_refs 过滤掉非字符串 / 空值
 */
function normalizeContentTaskCard(raw: unknown): ParseGenerateBodyResult["contentTaskCard"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const rec = raw as Record<string, unknown>
  const coreClaim = typeof rec.core_claim === "string" ? rec.core_claim.trim() : ""
  if (!coreClaim) return undefined
  const audience = typeof rec.audience === "string" ? rec.audience : undefined
  const pain = typeof rec.pain === "string" ? rec.pain : undefined
  const caseRefsRaw = Array.isArray(rec.case_refs) ? rec.case_refs : []
  const case_refs = caseRefsRaw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  const product_link = typeof rec.product_link === "string" ? rec.product_link : undefined
  let platform_angles: Record<string, string> | undefined
  if (rec.platform_angles && typeof rec.platform_angles === "object" && !Array.isArray(rec.platform_angles)) {
    const pa: Record<string, string> = {}
    for (const [k, v] of Object.entries(rec.platform_angles)) {
      if (typeof v === "string") pa[k] = v
    }
    if (Object.keys(pa).length > 0) platform_angles = pa
  }
  return {
    audience: audience || undefined,
    pain: pain || undefined,
    core_claim: coreClaim,
    case_refs: case_refs.length > 0 ? case_refs : undefined,
    product_link: product_link || undefined,
    platform_angles,
  }
}

/**
 * @description 验证生成输入参数
 * @param parsed - 解析后的生成参数
 * @returns 错误信息，验证通过返回 null
 */
export function validateGenerateInput(parsed: {
  rawInput: string
  projectId: string
  targetFormats: ContentFormat[]
  agentId?: string
  agentModule?: CopyStudioModule
  sourceEnvelope?: AimContentSourceEnvelope
}): string | null {
  if (parsed.agentModule && !supportsCopyStudioModule(parsed.agentId)) return "agentModule 只能用于内容创作官"
  if (parsed.agentModule && !agentAllowsContentModeSelector(parsed.agentId)) {
    return "当前专家未授权创作模式选择"
  }
  if (!parsed.rawInput) return "请输入内容"
  if (parsed.sourceEnvelope && parsed.rawInput !== parsed.sourceEnvelope.currentUserRequest) {
    return "当前用户要求与来源信封不一致"
  }
  if (parsed.targetFormats.length === 0) return "请选择至少一种生成格式"
  return null
}
