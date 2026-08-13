import { prisma } from "@/lib/prisma"
import { buildAimGeneration } from "./aim-agent-handlers"
import { parseStrictMultiFormatResponse } from "@/lib/aim/output-delivery-gate"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import type { AimTraceRecorder } from "@/lib/aim-observability"
import type { ContentScenario } from "@/lib/content-scenario-config"
import type { AimRunSpec } from "@/lib/aim-harness/types"
import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"

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

export interface AimInput {
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
  runSpec?: AimRunSpec
  /** ADR-002：显式选择的命名方法论 profile id（透传到 buildAimGeneration → prepareAimContext）。 */
  methodologyProfileIds?: string[]
  /** 用户确认的本轮意图（优先于规则推断） */
  confirmedTurnIntent?: import("@/lib/aim-turn-intent").AimTurnIntent
  /** 发布质检官模式 */
  reviewMode?: import("@/features/newsroom/contracts").ContentReviewMode
  /** 写作风格显式覆盖：true=强制启用 false=强制禁用。透传到 buildAimGeneration → prepareAimContext。 */
  useStyleProfileOverride?: boolean
  /** 方法论类技能一次性透传：本轮按需注入对应方法论/爆款结构。透传到 prepareAimContext。 */
  activeMethodologySignals?: import("@/lib/aim-agent-guides").AimMethodologySignal[]
  unifiedContentExecution?: { envelope: AimContentSourceEnvelope; brief: string }
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

/**
 * @description 构建爆款结构库文本块（开头库、文案结构库、结尾库）
 * @returns 爆款结构库文本，无数据时返回空字符串
 */
export async function buildViralStructureBlock(): Promise<string> {
  const [openingTypes, copyStructures, endingTypes] = await Promise.all([
    prisma.openingType.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
      select: { name: true, description: true, formulas: true },
      take: 200,
    }),
    prisma.copyStructure.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
      select: { name: true, description: true, beats: true },
      take: 200,
    }),
    prisma.endingType.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
      select: { name: true, guidance: true, patterns: true },
      take: 200,
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

/**
 * @description 解析多格式 LLM 响应内容
 * @param raw - LLM 返回的原始文本
 * @param formats - 目标格式列表
 * @returns 各格式对应的内容字典
 */
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

  const parsed = parseStrictMultiFormatResponse(raw, formats)
  if (parsed.ok) Object.assign(result, parsed.contents)

  return result
}

// ─── 代理生成器 ──────────────────────────────────────────────

/**
 * @description 生成 AIM 内容（统一入口）
 * @param input - 生成输入（用户 ID、项目 ID、原始输入、目标格式等）
 * @returns 生成结果
 */
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
    existingGenerationId: input.existingGenerationId,
    runtimeTask: input.runtimeTask,
    contentScenario: input.contentScenario,
    trace: input.trace,
    topicSelectionId: input.topicSelectionId,
    selectedTopicIndex: input.selectedTopicIndex,
    taskSpec: input.taskSpec,
    runSpec: input.runSpec,
    methodologyProfileIds: input.methodologyProfileIds,
    confirmedTurnIntent: input.confirmedTurnIntent,
    reviewMode: input.reviewMode,
    useStyleProfileOverride: input.useStyleProfileOverride,
    activeMethodologySignals: input.activeMethodologySignals,
    unifiedContentExecution: input.unifiedContentExecution,
  })
}
