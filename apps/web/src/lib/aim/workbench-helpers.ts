import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import { AIM_FORMAT_LABELS } from "@/lib/aim/workbench-display"
import { reportAimRunEvent } from "@/lib/aim/run-events"
import type { AimEditorContext, TextSelectionRange } from "@/lib/aim-editor"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import type { AimImageAttachment, AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { AimChatToolAction, AimGeneration, ContentFormat } from "@/lib/api/client"

let sequence = 0

export function nextAimWorkbenchId(prefix = "m") {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}

export function buildAimRawInput(messages: AimWorkbenchMessage[], extra?: string) {
  const userTexts = messages.filter((message) => message.role === "user").map((message) => message.content)
  if (extra) userTexts.push(extra)
  return userTexts.filter(Boolean).join("\n\n")
}

export function detectAimLarkToolAction(text: string): AimChatToolAction | null {
  if (!/飞书/.test(text)) return null
  if (/同步.*选题|导入.*选题/.test(text)) return "import_lark_topics"
  if (/热点|竞品|优质账号|参考|数据/.test(text) && /导入|同步/.test(text)) return "import_lark_archive_data"
  if (/项目/.test(text) && /导入|同步/.test(text)) return "import_lark_project_data"
  if (/回写|同步到飞书|同步.*脚本|同步.*内容/.test(text)) return "export_lark_generation"
  return null
}

export function findLatestAimDeliverableId(messages: AimWorkbenchMessage[]) {
  return [...messages].reverse().find((message) => message.deliverables?.id)?.deliverables?.id
}

export function findLatestAimVideoDeliverableMessageId(messages: AimWorkbenchMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.deliverables?.results.some((result) => result.format === "video_script"))
    ?.id
}

export function findLatestAimDeliverableText(messages: AimWorkbenchMessage[]) {
  const latest = [...messages].reverse().find((message) => message.deliverables?.results.length)
  return latest?.deliverables?.results[0]?.content.trim() || ""
}

export function getAimOpeningSegment(text: string) {
  const trimmed = text.trimStart()
  const offset = text.length - trimmed.length
  const paragraphs = trimmed.split(/\n\s*\n/)
  const first = paragraphs[0]?.trim() || ""
  const second = paragraphs[1]?.trim() || ""
  const segment = first.length < 80 && second ? `${first}\n\n${second}` : first
  return { offset, segment }
}

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

export function extractPersonaProgress(content: string): number | null {
  const match = content.match(/【进度\s*(\d+)\s*%】/)
  if (!match) return null
  const value = parseInt(match[1], 10)
  return Number.isNaN(value) ? null : Math.min(100, Math.max(0, value))
}

export function formatAnalysisResultForPrompt(analysisResult: unknown) {
  if (!analysisResult) return null
  if (typeof analysisResult === "object" && "markdown" in analysisResult) {
    const markdown = (analysisResult as { markdown?: unknown }).markdown
    if (typeof markdown === "string" && markdown.trim()) return cleanVideoCopyAnalysisMarkdown(markdown)
  }
  return JSON.stringify(analysisResult, null, 2)
}

export function extractBenchmarkOriginalText(text: string) {
  const marker = text.match(/对标原文[：:]/)
  if (marker?.index == null) return ""
  const rest = text.slice(marker.index + marker[0].length).trim()
  const nextSection = rest.search(/\n(?:已有拆解|结构化拆解|改写原则|创作原则|===|来源链接|硬规则)[：:：]?/)
  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim()
}

export function extractBenchmarkAnalysisText(text: string) {
  const marker = text.match(/(?:已有拆解|结构化拆解)[：:]/)
  if (marker?.index != null) return text.slice(marker.index + marker[0].length).trim()
  const numberedStructure = text.match(/(?:^|\n)\d+[.、]\s*.+\n内容[：:]/)
  return numberedStructure?.index == null ? "" : text.slice(numberedStructure.index).trim()
}

export function getAimHistoryContents(item: AimGeneration) {
  return [
    item.videoScript ? { format: "video_script" as const, content: item.videoScript } : null,
    item.wechatArticle ? { format: "wechat_article" as const, content: item.wechatArticle } : null,
    item.momentsPost ? { format: "moments_post" as const, content: item.momentsPost } : null,
    item.communityMessage ? { format: "community_message" as const, content: item.communityMessage } : null,
    item.shootingBrief ? { format: "shooting_brief" as const, content: item.shootingBrief } : null,
    item.rawCopy ? { format: "raw_copy" as const, content: item.rawCopy } : null,
  ].filter(Boolean) as Array<{ format: ContentFormat; content: string }>
}

export function buildAimHistoryRawInput(baseInput: string, currentInput: string, messages: AimWorkbenchMessage[]) {
  const turns = messages
    .map((message) => {
      const text = message.content.trim()
      const deliverableNote = message.deliverables?.results.length
        ? `生成了：${message.deliverables.results.map((result) => AIM_FORMAT_LABELS[result.format] || result.format).join("、")}`
        : ""
      const content = [text, deliverableNote].filter(Boolean).join("\n")
      if (!content) return ""
      return `${message.role === "user" ? "用户" : "助手"}：${content}`
    })
    .filter(Boolean)
  const current = currentInput.trim() ? [`用户：${currentInput.trim()}`] : []
  if (turns.length === 0 && current.length === 0) return baseInput
  return ["【本轮对话】", ...turns, ...current, "", "【本次生成输入】", baseInput].join("\n")
}

export function prepareAimChatTurn(input: {
  messages: AimWorkbenchMessage[]
  text: string
  images: AimImageAttachment[]
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
    content: input.text || "请分析这张图片。",
    images: input.images,
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

export function reportAimChatRevision(messages: AimWorkbenchMessage[], retryMessageId: string | undefined, startsNewTask: boolean) {
  if (retryMessageId || startsNewTask) return
  const revisedRun = [...messages].reverse().find((message) => message.deliverables && message.runId)?.runId
  reportAimRunEvent(revisedRun, "revised", { channel: "chat" })
}
