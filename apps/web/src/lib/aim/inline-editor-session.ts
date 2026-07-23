import type { ContentFormat } from "@/lib/api/client"
import type { TextSelectionRange } from "@/lib/aim-editor"

export type InlineSelectionActionId =
  | "polish"
  | "rewrite"
  | "expand"
  | "shorten"
  | "colloquial"
  | "custom"

export interface InlinePendingReplacement {
  original: string
  replacement: string
  range: TextSelectionRange
  baseContentHash: string
}

export interface AimInlineEditorSession {
  messageId: string
  generationId: string
  format: ContentFormat
  baseContent: string
  draftContent: string
  baseContentHash: string
  selection?: { start: number; end: number; text: string }
  mode: "editing" | "comparing"
  dirty: boolean
  saving: boolean
  error?: string
  pendingReplacement?: InlinePendingReplacement
}

export function hashInlineContent(content: string): string {
  // 轻量指纹：足够检测选区过期，无需加密强度
  let hash = 0
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) | 0
  }
  return `${content.length}:${hash}`
}

export function sessionKey(messageId: string, format: ContentFormat): string {
  return `${messageId}:${format}`
}

export const INLINE_SELECTION_ACTIONS: Array<{ id: InlineSelectionActionId; label: string; prompt: string }> = [
  { id: "polish", label: "润色", prompt: "请润色选中文案，保持原意与说话风格，只修正表达。" },
  { id: "rewrite", label: "改写", prompt: "请改写选中文案，保持核心信息，换一种更有冲击力的说法。" },
  { id: "expand", label: "扩写", prompt: "请扩写选中文案，补充必要细节，不要跑题。" },
  { id: "shorten", label: "精简", prompt: "请精简选中文案，删掉水分，保留关键信息。" },
  { id: "colloquial", label: "更口语", prompt: "请把选中文案改得更口语、更像真人说话。" },
]

export function buildInlineSelectionPrompt(action: InlineSelectionActionId, selectedText: string, customRequest?: string): string {
  const actionPrompt = action === "custom"
    ? (customRequest?.trim() || "请按我的要求修改选中文案。")
    : (INLINE_SELECTION_ACTIONS.find((item) => item.id === action)?.prompt ?? "请修改选中文案。")
  return [
    actionPrompt,
    "只输出「修改思路」和「替换稿」两部分；替换稿必须可直接替换选中片段。",
    "",
    "【选中原文】",
    selectedText,
  ].join("\n")
}
