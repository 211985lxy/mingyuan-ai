import type { ContentFormat } from "@/lib/api/client"
import { scrubPromptLeakageFromBody } from "@/lib/aim-generation-text"

export const AIM_FORMAT_LABELS: Record<ContentFormat, string> = {
  video_script: "口播文案",
  wechat_article: "公众号文章",
  moments_post: "朋友圈文案",
  community_message: "社群运营文案",
  shooting_brief: "拍摄交接单",
  raw_copy: "原始文案",
  koubo_script: "口播文案",
  xiaohongshu_post: "小红书图文",
}

export const AIM_SOFT_ACTION_CLASS = "h-7 shrink-0 rounded-md border-0 bg-muted/45 px-2.5 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
export const AIM_ACTIVE_SOFT_ACTION_CLASS = "h-7 rounded-md border-0 bg-primary/10 px-2 text-xs text-primary shadow-none hover:bg-primary/15"

export const AIM_WORKFLOW_STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "pending_review", label: "待审核" },
  { value: "ready_to_shoot", label: "待拍摄" },
  { value: "shooting", label: "拍摄中" },
  { value: "editing", label: "剪辑中" },
  { value: "ready_to_publish", label: "待发布" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
]

/**
 * @description 获取 AIM 工作流状态标签
 * @param status - 状态值
 * @returns 状态标签文本
 */
export function getAimWorkflowStatusLabel(status?: string | null) {
  return AIM_WORKFLOW_STATUS_OPTIONS.find((item) => item.value === status)?.label || "草稿"
}

/**
 * @description 分离 AIM 方法注释和结果内容
 * @param content - 包含方法注释的内容
 * @returns 分离后的方法注释和结果
 */
export function splitAimMethodNote(content: string) {
  const stripFormatMarkers = (text: string) => text.replace(/===FORMAT(?::[^=\n]+)?===/gu, "")
  const OPEN_TAG = "[[AIM_METHOD_NOTE]]"
  const match = content.match(/\[\[AIM_METHOD_NOTE\]\]([\s\S]*?)\[\[\/AIM_METHOD_NOTE\]\]/)
  // 流式未闭合：note 开始之后的全部内容先进折叠区，避免思考过程当正文实时渲染
  if (!match && content.includes(OPEN_TAG)) {
    const [before, ...rest] = content.split(OPEN_TAG)
    return {
      methodNote: rest.join(OPEN_TAG).trim(),
      result: normalizeScriptBodySpacing(scrubPromptLeakageFromBody(stripFormatMarkers(before))),
    }
  }
  if (!match) {
    return { methodNote: "", result: normalizeScriptBodySpacing(scrubPromptLeakageFromBody(stripFormatMarkers(content))) }
  }
  return {
    methodNote: match[1].trim(),
    result: normalizeScriptBodySpacing(scrubPromptLeakageFromBody(stripFormatMarkers(content.replace(match[0], "")))),
  }
}

/**
 * 压缩成稿多余空行：连续空行最多保留 1 个；连续短句段落合并为软换行，
 * 避免口播「一句一段」把版面撑疏。真段落（空行分隔）仍保留，供朗读/竹简按空行分组。
 */
export function normalizeScriptBodySpacing(text: string): string {
  const collapsed = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return compactShortScriptParagraphs(scrubPromptLeakageFromBody(collapsed))
}

const SHORT_SCRIPT_PARAGRAPH_CHARS = 40

function compactShortScriptParagraphs(text: string): string {
  const parts = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return text

  const isShortLine = (line: string) => [...line].length <= SHORT_SCRIPT_PARAGRAPH_CHARS
  const isShortPara = (part: string) => !part.includes("\n") && isShortLine(part)
  const lastLineShort = (part: string) => {
    const lines = part.split("\n")
    return isShortLine(lines[lines.length - 1] || "")
  }

  const out: string[] = []
  for (const part of parts) {
    const prev = out[out.length - 1]
    if (prev && isShortPara(part) && lastLineShort(prev)) {
      out[out.length - 1] = `${prev}\n${part}`
    } else {
      out.push(part)
    }
  }
  return out.join("\n\n")
}
