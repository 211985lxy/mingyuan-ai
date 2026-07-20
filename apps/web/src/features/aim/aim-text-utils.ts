import type { AimGeneration, ContentFormat } from "@/lib/api/client"
import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import { FORMAT_LABELS } from "@/features/aim/aim-format-labels"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"

/**
 * @description 提取progress
 * @param content - 内容
 * @returns number | null
 */
export function extractProgress(content: string): number | null {
  const m = content.match(/【进度\s*(\d+)\s*%】/)
  if (!m) return null
  const v = parseInt(m[1], 10)
  return Number.isNaN(v) ? null : Math.min(100, Math.max(0, v))
}

/**
 * @description 拆分methodnote
 * @param content - 内容
 * @returns 无返回值
 */
export function splitMethodNote(content: string) {
  const match = content.match(/\[\[AIM_METHOD_NOTE\]\]([\s\S]*?)\[\[\/AIM_METHOD_NOTE\]\]/)
  if (!match) return { methodNote: "", result: content }
  return {
    methodNote: match[1].trim(),
    result: content.replace(match[0], "").trim(),
  }
}

/**
 * @description 格式化analysisresultforprompt
 * @param analysisResult - 分析结果
 * @returns 无返回值
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
 * @description 提取benchmarkoriginaltext
 * @param text - 文本
 * @returns 无返回值
 */
export function extractBenchmarkOriginalText(text: string) {
  const marker = text.match(/对标原文[：:]/)
  if (marker?.index == null) return ""
  const start = marker.index + marker[0].length
  const rest = text.slice(start).trim()
  const nextSection = rest.search(/\n(?:已有拆解|结构化拆解|改写原则|创作原则|===|来源链接|硬规则)[：:：]?/)
  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim()
}

/**
 * @description 提取benchmarkanalysistext
 * @param text - 文本
 * @returns 无返回值
 */
export function extractBenchmarkAnalysisText(text: string) {
  const marker = text.match(/(?:已有拆解|结构化拆解)[：:]/)
  if (marker?.index != null) return text.slice(marker.index + marker[0].length).trim()
  const numberedStructure = text.match(/(?:^|\n)\d+[.、]\s*.+\n内容[：:]/)
  return numberedStructure?.index == null ? "" : text.slice(numberedStructure.index).trim()
}

/**
 * @description 获取historycontents
 * @param item - 条目
 * @returns 无返回值
 */
export function getHistoryContents(item: AimGeneration) {
  return [
    item.videoScript ? { format: "video_script" as const, content: item.videoScript } : null,
    item.wechatArticle ? { format: "wechat_article" as const, content: item.wechatArticle } : null,
    item.momentsPost ? { format: "moments_post" as const, content: item.momentsPost } : null,
    item.communityMessage ? { format: "community_message" as const, content: item.communityMessage } : null,
    item.shootingBrief ? { format: "shooting_brief" as const, content: item.shootingBrief } : null,
    item.rawCopy ? { format: "raw_copy" as const, content: item.rawCopy } : null,
  ].filter(Boolean) as Array<{ format: ContentFormat; content: string }>
}

/**
 * @description 构建historyrawinput
 * @param baseInput - 基础值输入数据
 * @param currentInput - 当前值输入数据
 * @param messages - 消息列表
 * @returns 无返回值
 */
export function buildHistoryRawInput(baseInput: string, currentInput: string, messages: ChatMessage[]) {
  const turns = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const text = message.content.trim()
      const deliverableNote = message.deliverables?.results.length
        ? `生成了：${message.deliverables.results.map((result) => FORMAT_LABELS[result.format] || result.format).join("、")}`
        : ""
      const content = [text, deliverableNote].filter(Boolean).join("\n")
      if (!content) return ""
      return `${message.role === "user" ? "用户" : "助手"}：${content}`
    })
    .filter(Boolean)
  const current = currentInput.trim() ? [`用户：${currentInput.trim()}`] : []
  if (turns.length === 0 && current.length === 0) return baseInput
  return [`【本轮对话】`, ...turns, ...current, "", `【本次生成输入】`, baseInput].join("\n")
}
