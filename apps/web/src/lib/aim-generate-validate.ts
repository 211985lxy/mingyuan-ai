import type { ContentFormat, AimTaskType } from "@/lib/aim-generator"
import { VALID_TOPIC_TYPES } from "@/lib/topic-validation"

const VALID_FORMATS = new Set([
  "video_script",
  "wechat_article",
  "moments_post",
  "community_message",
  "shooting_brief",
  "raw_copy",
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
}

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
    ? body.targetFormats.filter((format: unknown): format is ContentFormat =>
        typeof format === "string" && VALID_FORMATS.has(format)
      )
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
  }
}

export function validateGenerateInput(parsed: {
  rawInput: string
  projectId: string
  targetFormats: ContentFormat[]
}): string | null {
  if (!parsed.rawInput) return "请输入内容"
  if (parsed.targetFormats.length === 0) return "请选择至少一种生成格式"
  return null
}
