import { prisma } from "@/lib/prisma"
import { buildAimGeneration } from "./aim-agent-handlers"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import type { AimTraceRecorder } from "@/lib/aim-observability"
import type { ContentScenario } from "@/lib/content-scenario-config"

export type ContentFormat =
  | "video_script"
  | "wechat_article"
  | "moments_post"
  | "community_message"
  | "shooting_brief"
  | "raw_copy"
  | "koubo_script"
  | "xiaohongshu_post"

export type AimTaskType =
  | "polish_copy"
  | "write_script"
  | "quality_check"
  | "repurpose"

interface AimInput {
  userId: string
  agentId?: string
  projectId?: string
  rawInput: string
  targetFormats: ContentFormat[]
  taskType?: AimTaskType
  topicTitle?: string
  topicRationale?: string
  topicType?: string
  hotTopic?: string
  polishInstruction?: string
  videoCopyExtractionId?: string
  runtimeTask?: AimRuntimeTask
  contentScenario?: ContentScenario
  existingGenerationId?: string
  trace?: AimTraceRecorder
  topicSelectionId?: string
  selectedTopicIndex?: number
  taskSpec?: import("@/lib/task-spec").TaskSpec
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
}

function asBeatArray(value: unknown): Array<{ label: string; instruction: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const label = typeof record.label === "string" ? record.label : ""
    const instruction = typeof record.instruction === "string" ? record.instruction : ""
    return label && instruction ? [{ label, instruction }] : []
  })
}

export async function buildViralStructureBlock(): Promise<string> {
  const [openingTypes, copyStructures, endingTypes] = await Promise.all([
    prisma.openingType.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
      select: { name: true, description: true, formulas: true },
    }),
    prisma.copyStructure.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
      select: { name: true, description: true, beats: true },
    }),
    prisma.endingType.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
      select: { name: true, guidance: true, patterns: true },
    }),
  ])

  if (openingTypes.length + copyStructures.length + endingTypes.length === 0) {
    return ""
  }

  let block = "\n\n=== 专业爆款结构库 ===\n"

  if (openingTypes.length > 0) {
    block += "\n【爆款开头库】\n"
    for (const item of openingTypes) {
      const formulas = asStringArray(item.formulas)
      block += `- ${item.name}：${item.description}`
      if (formulas.length > 0) block += `；公式：${formulas.join(" / ")}`
      block += "\n"
    }
  }

  if (copyStructures.length > 0) {
    block += "\n【爆款文案结构库】\n"
    for (const item of copyStructures) {
      const beats = asBeatArray(item.beats)
      block += `- ${item.name}：${item.description}`
      if (beats.length > 0) {
        block += `；节拍：${beats.map((beat) => `${beat.label}(${beat.instruction})`).join(" → ")}`
      }
      block += "\n"
    }
  }

  if (endingTypes.length > 0) {
    block += "\n【结尾类型库】\n"
    for (const item of endingTypes) {
      const patterns = asStringArray(item.patterns)
      block += `- ${item.name}：${item.guidance}`
      if (patterns.length > 0) block += `；模式：${patterns.join(" / ")}`
      block += "\n"
    }
  }

  return block
}

export function parseMultiFormatResponse(
  raw: string,
  formats: ContentFormat[]
): Record<ContentFormat, string | undefined> {
  const result: Record<ContentFormat, string | undefined> = {
    video_script: undefined,
    wechat_article: undefined,
    moments_post: undefined,
    community_message: undefined,
    shooting_brief: undefined,
    raw_copy: undefined,
    koubo_script: undefined,
    xiaohongshu_post: undefined,
  }

  for (let i = 0; i < formats.length; i++) {
    const format = formats[i]
    const marker = `===FORMAT:${format}===`
    const nextMarker = i + 1 < formats.length
      ? `===FORMAT:${formats[i + 1]}===`
      : null

    const start = raw.indexOf(marker)
    if (start === -1) continue

    const contentStart = start + marker.length
    const end = nextMarker ? raw.indexOf(nextMarker) : raw.length

    result[format] = raw.substring(
      contentStart,
      end === -1 ? undefined : end
    ).trim()
  }

  if (!Object.values(result).some(Boolean) && formats.length === 1) {
    result[formats[0]] = raw.trim()
  }

  return result
}

// ─── 代理生成器 ──────────────────────────────────────────────

export async function generateAimContent(input: AimInput) {
  return buildAimGeneration(input.agentId || "content_producer", {
    userId: input.userId,
    projectId: input.projectId,
    rawInput: input.rawInput,
    targetFormats: input.targetFormats,
    taskType: input.taskType,
    topicTitle: input.topicTitle,
    topicRationale: input.topicRationale,
    topicType: input.topicType,
    hotTopic: input.hotTopic,
    polishInstruction: input.polishInstruction,
    videoCopyExtractionId: input.videoCopyExtractionId,
    runtimeTask: input.runtimeTask,
    contentScenario: input.contentScenario,
    trace: input.trace,
    topicSelectionId: input.topicSelectionId,
    selectedTopicIndex: input.selectedTopicIndex,
    taskSpec: input.taskSpec,
  })
}
