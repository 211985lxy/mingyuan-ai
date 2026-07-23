import type { ContentFormat, AimTaskType } from "@/lib/aim-generator"
import { normalizeRequestedCopyStudioModule, supportsCopyStudioModule, type CopyStudioModule } from "@/lib/copy-studio"
import { VALID_TOPIC_TYPES } from "@/lib/topic-validation"
import { parseWorkflowBriefRequest } from "@/lib/aim-workflow"
import { normalizeConfirmedTurnIntent, type AimTurnIntent } from "@/lib/aim-turn-intent"

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
    confirmedTurnIntent: normalizeConfirmedTurnIntent(body.confirmedTurnIntent) || undefined,
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
}): string | null {
  if (parsed.agentModule && !supportsCopyStudioModule(parsed.agentId)) return "agentModule 只能用于内容创作官"
  if (!parsed.rawInput) return "请输入内容"
  if (parsed.targetFormats.length === 0) return "请选择至少一种生成格式"
  return null
}
