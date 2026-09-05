import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import { buildBenchmarkMaterialPrefill } from "@/lib/aim-benchmark-length"
import { assessBenchmarkRewrite } from "@/lib/aim-benchmark-quality"
import { normalizeKnowledgeUsed } from "@/lib/aim-knowledge-cite"
import { stripAimFormatMarkers } from "@/lib/aim/format-marker-cleanup"
import { AIM_FORMAT_LABELS, splitAimMethodNote } from "@/lib/aim/workbench-display"
import { reportAimRunEvent } from "@/lib/aim/run-events"
import { extractEditorDraftFromAssistantText, type AimEditorContext, type TextSelectionRange } from "@/lib/aim-editor"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import type { AimImageAttachment, AimFileAttachment, AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import { getContentPackageFromTaskSpec } from "@/lib/content-package-spec"
import type { AimChatToolAction, AimGenerateResponse, AimGeneration, ContentFormat } from "@/lib/api/client"

let sequence = 0

/**
 * @description 生成下一个 AIM 工作台 ID
 * @param prefix - ID 前缀
 * @returns 唯一 ID 字符串
 */
export function nextAimWorkbenchId(prefix = "m") {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}

/**
 * @description 构建 AIM 原始输入（合并用户消息）
 * @param messages - 工作台消息列表
 * @param extra - 额外输入文本
 * @returns 合并后的原始输入
 */
export function buildAimRawInput(messages: AimWorkbenchMessage[], extra?: string) {
  const userTexts = messages.filter((message) => message.role === "user").map((message) => message.content)
  if (extra) userTexts.push(extra)
  return userTexts.filter(Boolean).join("\n\n")
}

/**
 * @description 检测用户输入中的飞书工具动作
 * @param text - 用户输入文本
 * @returns 检测到的工具动作，未检测到时返回 null
 */
export function detectAimLarkToolAction(text: string): AimChatToolAction | null {
  if (!/飞书/.test(text)) return null
  if (/同步.*选题|导入.*选题/.test(text)) return "import_lark_topics"
  if (/热点|竞品|优质账号|参考|数据/.test(text) && /导入|同步/.test(text)) return "import_lark_archive_data"
  if (/项目/.test(text) && /导入|同步/.test(text)) return "import_lark_project_data"
  if (/回写|同步到飞书|同步.*脚本|同步.*内容/.test(text)) return "export_lark_generation"
  return null
}

/**
 * @description 查找最新的 AIM 交付物 ID
 * @param messages - 工作台消息列表
 * @returns 最新交付物 ID
 */
export function findLatestAimDeliverableId(messages: AimWorkbenchMessage[]) {
  return [...messages].reverse().find((message) => message.deliverables?.id)?.deliverables?.id
}

/**
 * @description 查找最新的 AIM 视频交付物消息 ID
 * @param messages - 工作台消息列表
 * @returns 消息 ID
 */
export function findLatestAimVideoDeliverableMessageId(messages: AimWorkbenchMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.deliverables?.results.some((result) => result.format === "video_script"))
    ?.id
}

/**
 * @description 查找最新的 AIM 交付物文本内容
 * @param messages - 工作台消息列表
 * @returns 交付物文本
 */
export function findLatestAimDeliverableText(messages: AimWorkbenchMessage[]) {
  const latest = [...messages].reverse().find((message) => message.deliverables?.results.length)
  return latest?.deliverables?.results[0]?.content.trim() || ""
}

/** 注入模型上下文时的单份成稿上限，避免撑爆窗口 */
export const AIM_MODEL_DELIVERABLE_MAX_CHARS = 12_000

/**
 * 把助手消息里的交付物正文展开进模型可见文本。
 * UI 仍可只显示 stub；否则「这篇/这个文案」追问会看不到成稿。
 */
export function formatAimMessageContentForModel(message: {
  role: string
  content: string
  deliverables?: AimWorkbenchMessage["deliverables"]
}): string {
  const text = message.content.trim()
  const results = message.deliverables?.results?.filter((result) => result.content?.trim()) ?? []
  if (message.role !== "assistant" || results.length === 0) return text

  const bodies = results.map((result) => {
    const label = AIM_FORMAT_LABELS[result.format] || result.format
    let body = result.content.trim()
    if (body.length > AIM_MODEL_DELIVERABLE_MAX_CHARS) {
      body = `${body.slice(0, AIM_MODEL_DELIVERABLE_MAX_CHARS)}\n…（已截断）`
    }
    return `【${label}正文】\n${body}`
  })

  // 若 stub 已含正文（极少见）则不再重复
  if (bodies.every((block) => text.includes(block.slice(0, Math.min(80, block.length))))) {
    return text
  }
  return [text, ...bodies].filter(Boolean).join("\n\n")
}

export function buildAimRelevantConversation(messages: AimWorkbenchMessage[]) {
  return messages
    .map((message) => ({
      role: message.role,
      content: formatAimMessageContentForModel(message),
    }))
    .filter((message): message is { role: "user" | "assistant"; content: string } =>
      (message.role === "user" || message.role === "assistant") && message.content.trim().length > 0)
    .slice(-12)
}

/**
 * @description 获取 AIM 开头片段（前 1-2 段）
 * @param text - 完整文本
 * @returns 开头片段和偏移量
 */
export function getAimOpeningSegment(text: string) {
  const trimmed = text.trimStart()
  const offset = text.length - trimmed.length
  const paragraphs = trimmed.split(/\n\s*\n/)
  const first = paragraphs[0]?.trim() || ""
  const second = paragraphs[1]?.trim() || ""
  const segment = first.length < 80 && second ? `${first}\n\n${second}` : first
  return { offset, segment }
}

/**
 * @description 构建 AIM 编辑器上下文
 * @param input - 构建输入（动作、选区、编辑器文本、标签）
 * @returns 编辑器上下文对象
 */
export function buildAimEditorContext(input: {
  action: string
  referenceSelection: string
  draftSelection: string
  editorText: string
  labels: Pick<EditorPanelLabels, "documentType" | "referenceTitle" | "draftTitle">
}): AimEditorContext {
  return {
    action: input.action,
    referenceSelection: input.referenceSelection.trim() || undefined,
    draftSelection: input.draftSelection.trim() || undefined,
    draftText: input.editorText.trim() || undefined,
    documentType: input.labels.documentType,
    referenceLabel: input.labels.referenceTitle,
    draftLabel: input.labels.draftTitle,
  }
}

/**
 * @description 从内容中提取人设智能体进度百分比
 * @param content - 包含进度标记的内容
 * @returns 进度百分比（0-100），未找到时返回 null
 */
export function extractPersonaProgress(content: string): number | null {
  const match = content.match(/【进度\s*(\d+)\s*%】/)
  if (!match) return null
  const value = parseInt(match[1], 10)
  return Number.isNaN(value) ? null : Math.min(100, Math.max(0, value))
}

/**
 * @description 格式化分析结果为提示词文本
 * @param analysisResult - 分析结果对象
 * @returns 格式化的文本，无效时返回 null
 */
export function formatAnalysisResultForPrompt(analysisResult: unknown) {
  if (!analysisResult) return null
  if (typeof analysisResult === "object" && "markdown" in analysisResult) {
    const markdown = (analysisResult as { markdown?: unknown }).markdown
    if (typeof markdown === "string" && markdown.trim()) return cleanVideoCopyAnalysisMarkdown(markdown)
  }
  return JSON.stringify(analysisResult, null, 2)
}

/**
 * @description 从文本中提取对标原文
 * @param text - 包含对标原文标记的文本
 * @returns 提取的对标原文
 */
export function extractBenchmarkOriginalText(text: string) {
  const marker = text.match(/对标原文[：:]/)
  if (marker?.index == null) return ""
  const rest = text.slice(marker.index + marker[0].length).trim()
  const nextSection = rest.search(/\n(?:已有拆解|结构化拆解|改写原则|创作原则|===|来源链接|硬规则)[：:：]?/)
  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim()
}

/**
 * @description 从文本中提取对标拆解分析
 * @param text - 包含拆解标记的文本
 * @returns 提取的拆解分析文本
 */
export function extractBenchmarkAnalysisText(text: string) {
  const marker = text.match(/(?:已有拆解|结构化拆解)[：:]/)
  if (marker?.index != null) return text.slice(marker.index + marker[0].length).trim()
  const numberedStructure = text.match(/(?:^|\n)\d+[.、]\s*.+\n内容[：:]/)
  return numberedStructure?.index == null ? "" : text.slice(numberedStructure.index).trim()
}

/**
 * @description 查找 AIM 对标原文
 * @param messages - 工作台消息列表
 * @param sourceOriginalText - 源对标原文
 * @returns 对标原文文本
 */
export function findAimBenchmarkOriginal(messages: AimWorkbenchMessage[], sourceOriginalText = "") {
  return sourceOriginalText.trim() || [...messages]
    .reverse()
    .map((message) => extractBenchmarkOriginalText(message.content))
    .find((content) => content.trim()) || ""
}

/**
 * @description 查找最新的 AIM 助手草稿
 * @param messages - 工作台消息列表
 * @returns 最新草稿文本
 */
export function findLatestAimAssistantDraft(messages: AimWorkbenchMessage[]) {
  return [...messages]
    .reverse()
    .filter((message) => message.role === "assistant")
    .map((message) => extractEditorDraftFromAssistantText(message.content))
    .find((content) => content.trim()) || ""
}

/**
 * @description 构建 AIM 对标改写输入
 * @param input - 构建输入（消息、对标原文、拆解、编辑器文本）
 * @returns 对标改写提示词，无对标原文时返回 null
 */
export function buildAimBenchmarkRewriteInput(input: {
  messages: AimWorkbenchMessage[]
  sourceOriginalText: string
  sourceAnalysisText: string
  editorText: string
}) {
  const original = findAimBenchmarkOriginal(input.messages, input.sourceOriginalText)
  if (!original) return null
  const currentDraft = input.editorText.trim() || findLatestAimDeliverableText(input.messages)
  // SOP/字数硬规则走系统侧提示，用户输入只保留材料
  return buildBenchmarkMaterialPrefill({
    intent: "rewrite",
    transcript: original,
    analysis: input.sourceAnalysisText,
    currentDraft,
  })
}

/**
 * @description 构建 AIM 对标质量检查消息
 * @param input - 构建输入（消息、对标原文、编辑器文本）
 * @returns 质量检查消息，无法检查时返回 null
 */
export function buildAimBenchmarkQualityMessage(input: {
  messages: AimWorkbenchMessage[]
  sourceOriginalText: string
  editorText: string
}) {
  const original = findAimBenchmarkOriginal(input.messages, input.sourceOriginalText)
  const draft = input.editorText.trim() || findLatestAimDeliverableText(input.messages)
  if (!original || !draft) return null
  const report = assessBenchmarkRewrite(original, draft)
  const lengthRatio = report.lengthRatio == null ? "无法计算" : `${Math.round(report.lengthRatio * 100)}%`
  const lengthStatus = report.lengthPassed ? "通过" : report.outputChars < report.originalChars ? "偏短" : "偏长"
  const copyStatus = report.tooSimilar ? "风险高，需要继续重写" : "通过"
  return [
    "## 对标自检结果",
    `- 字数：当前 ${report.outputChars} 字 / 原文 ${report.originalChars} 字，比例 ${lengthRatio}，判定：${lengthStatus}。`,
    `- 12字连续复用：${Math.round(report.reuseRatio * 100)}%，判定：${copyStatus}。`,
    report.reusedSamples.length
      ? `- 复用片段示例：${report.reusedSamples.map((sample) => `「${sample}」`).join("、")}`
      : "- 复用片段示例：未发现明显连续复用。",
    report.tooSimilar
      ? "- 结论：照抄风险高，需要替换开头、案例、过渡句或行动引导后重写；字数比例仅供参考，除非你选择了“保持原体量”，长度本身不构成不合格。"
      : "- 结论：照抄风险可控；字数比例仅供参考，除非你选择了“保持原体量”，长度不构成不合格，可继续看表达质量。",
  ].join("\n\n")
}

/**
 * @description 获取 AIM 生成历史内容列表（含 contentPackage.artifacts 中的派生格式）
 * @param item - AIM 生成记录
 * @returns 各格式内容数组
 */
export function getAimHistoryContents(item: AimGeneration) {
  const fromColumns = [
    item.videoScript ? { format: "video_script" as const, content: item.videoScript } : null,
    item.wechatArticle ? { format: "wechat_article" as const, content: item.wechatArticle } : null,
    item.momentsPost ? { format: "moments_post" as const, content: item.momentsPost } : null,
    item.communityMessage ? { format: "community_message" as const, content: item.communityMessage } : null,
    item.shootingBrief ? { format: "shooting_brief" as const, content: item.shootingBrief } : null,
    item.rawCopy ? { format: "raw_copy" as const, content: item.rawCopy } : null,
  ].filter(Boolean) as Array<{ format: ContentFormat; content: string }>

  const seen = new Set(fromColumns.map((item) => item.format))
  const artifacts = getContentPackageFromTaskSpec(item.taskSpec)?.artifacts ?? {}
  const fromArtifacts = (Object.entries(artifacts) as Array<[ContentFormat, string | undefined]>)
    .filter(([, content]) => typeof content === "string" && content.trim().length > 0)
    .filter(([format]) => !seen.has(format) && format !== "koubo_script")
    .map(([format, content]) => ({ format, content: content as string }))

  // koubo_script 仅在没有 video_script 时回填，避免重复口播 tab
  const koubo = artifacts.koubo_script?.trim()
  if (koubo && !seen.has("video_script") && !seen.has("koubo_script")) {
    fromArtifacts.push({ format: "koubo_script", content: koubo })
  }

  // 兼容历史成稿：清除可能已落库的模型格式收尾标记（===END FORMAT=== 等），与生成解析处同源清洗。
  return [...fromColumns, ...fromArtifacts].map((entry) => ({
    ...entry,
    content: stripAimFormatMarkers(entry.content),
  }))
}

/**
 * @description 将历史 AimGeneration 映射为气泡 deliverables（含 workflowStatus）
 */
export function mapAimGenerationToDeliverables(item: AimGeneration): AimGenerateResponse {
  const contents = getAimHistoryContents(item)
  const knowledgeUsed = normalizeKnowledgeUsed(item.knowledgeUsed)
  return {
    id: item.id,
    results: contents.map((content) => {
      // 旧客户端缓存/本地存储可能仍带 METHOD_NOTE：这里兜底拆分并保持字数只算正文
      const display = splitAimMethodNote(content.content)
      return {
        ...content,
        content: display.result,
        reasoningSummary: item.reasoningByFormat?.[content.format] ?? (display.methodNote || undefined),
        wordCount: display.result.length,
      }
    }),
    knowledgeUsed,
    taskSpec: item.taskSpec ?? undefined,
    workflowStatus: item.workflowStatus || "draft",
    projectId: item.projectId ?? null,
    reviewNote: item.reviewNote ?? null,
    publishPlatform: item.publishPlatform ?? null,
    publishUrl: item.publishUrl ?? null,
  }
}

/**
 * @description 状态推进后同步本地消息里的 deliverables 工作流字段
 */
export function patchDeliverableWorkflowFields(
  messages: AimWorkbenchMessage[],
  generationId: string,
  patch: {
    workflowStatus?: string
    publishPlatform?: string | null
    publishUrl?: string | null
    reviewNote?: string | null
  },
): AimWorkbenchMessage[] {
  return messages.map((message) => {
    if (!message.deliverables || message.deliverables.id !== generationId) return message
    return {
      ...message,
      deliverables: {
        ...message.deliverables,
        ...(patch.workflowStatus !== undefined ? { workflowStatus: patch.workflowStatus } : {}),
        ...(patch.publishPlatform !== undefined ? { publishPlatform: patch.publishPlatform } : {}),
        ...(patch.publishUrl !== undefined ? { publishUrl: patch.publishUrl } : {}),
        ...(patch.reviewNote !== undefined ? { reviewNote: patch.reviewNote } : {}),
      },
    }
  })
}

/**
 * @description 构建 AIM 历史原始输入（合并对话历史）
 * @param baseInput - 基础输入
 * @param currentInput - 当前输入
 * @param messages - 工作台消息列表
 * @returns 合并后的原始输入
 */
export function buildAimHistoryRawInput(baseInput: string, currentInput: string, messages: AimWorkbenchMessage[]) {
  const turns = messages
    .map((message) => {
      const content = formatAimMessageContentForModel(message)
      if (!content) return ""
      return `${message.role === "user" ? "用户" : "助手"}：${content}`
    })
    .filter(Boolean)
  const current = currentInput.trim() ? [`用户：${currentInput.trim()}`] : []
  if (turns.length === 0 && current.length === 0) return baseInput
  return ["【本轮对话】", ...turns, ...current, "", "【本次生成输入】", baseInput].join("\n")
}

/**
 * @description 准备 AIM 聊天轮次
 * @param input - 准备输入（消息、文本、图片、重试 ID 等）
 * @returns 聊天轮次准备结果
 */
export function prepareAimChatTurn(input: {
  messages: AimWorkbenchMessage[]
  text: string
  images: AimImageAttachment[]
  files?: AimFileAttachment[]
  retryMessageId?: string
  startsNewTask: boolean
  editorApplyRange?: TextSelectionRange
}) {
  const baseMessages = input.startsNewTask
    ? []
    : input.retryMessageId
      ? input.messages.filter((message) => message.id !== input.retryMessageId)
      : input.messages
  const userMessage: AimWorkbenchMessage = {
    id: nextAimWorkbenchId(),
    role: "user",
    content: input.text || (input.files?.length ? "请查看我附带的文件。" : "请分析这张图片。"),
    images: input.images,
    files: input.files,
  }
  const thread = input.retryMessageId ? baseMessages : [...baseMessages, userMessage]
  const assistantId = nextAimWorkbenchId()
  return {
    assistantId,
    thread,
    pendingMessages: [...thread, {
      id: assistantId,
      role: "assistant" as const,
      content: "正在思考，会先读取上下文和资料，再给出回复…",
      editorApply: input.editorApplyRange ? { range: input.editorApplyRange } : null,
    }],
  }
}

/**
 * @description 上报aimchatrevision
 * @param messages - 消息列表
 * @param retryMessageId - 重试次数消息唯一标识符
 * @param startsNewTask - startsNewTask
 * @returns 无返回值
 */
export function reportAimChatRevision(messages: AimWorkbenchMessage[], retryMessageId: string | undefined, startsNewTask: boolean) {
  if (retryMessageId || startsNewTask) return
  const revisedRun = [...messages].reverse().find((message) => message.deliverables && message.runId)?.runId
  reportAimRunEvent(revisedRun, "revised", { channel: "chat" })
}
