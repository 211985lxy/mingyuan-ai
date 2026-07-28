/**
 * 内容创作台：长文粘贴识别与用途装配（仅客户端状态，不进 Agent 契约）。
 */

export type PasteUsage = "edit" | "benchmark" | "style_sample"

export interface PastedCopyAttachment {
  content: string
  charCount: number
  usage?: PasteUsage
}

/** 正文不少于 300 字，或至少 6 行非空文本 → 长文附件 */
export const LONG_COPY_MIN_CHARS = 300
export const LONG_COPY_MIN_NONEMPTY_LINES = 6

export function countNonEmptyLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length
}

export function isLongCopyPaste(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return trimmed.length >= LONG_COPY_MIN_CHARS || countNonEmptyLines(trimmed) >= LONG_COPY_MIN_NONEMPTY_LINES
}

export function createPastedCopyAttachment(content: string, usage?: PasteUsage): PastedCopyAttachment {
  const trimmed = content.trim()
  return {
    content: trimmed,
    charCount: trimmed.length,
    usage,
  }
}

/** 从用户指令文本推断粘贴用途；裸粘贴返回 undefined */
export function inferPasteUsageFromInstruction(instruction: string): PasteUsage | undefined {
  const text = instruction.trim()
  if (!text) return undefined

  if (/(这是我以前写的|记住这种风格|以后按这个感觉|沉淀.*风格|学我的.*风格|记住我的.*口吻|按我的风格)/.test(text)) {
    return "style_sample"
  }
  if (/(按这篇仿写|参考结构|对标重写|对标仿写|仿写这篇|参考这篇|按对标|照着这篇)/.test(text)) {
    return "benchmark"
  }
  if (/(修改这篇|优化这篇|润色这篇|改这篇|帮我改|帮我优化|帮我润色|修改一下|优化一下|润色一下)/.test(text)) {
    return "edit"
  }
  return undefined
}

export function formatCharCount(count: number): string {
  return count.toLocaleString("zh-CN")
}

/**
 * 将附件装配进发送文本。
 * style_sample 不应走生成，调用方应拦截。
 */
export function assemblePasteUsageInput(input: {
  instruction: string
  attachment: PastedCopyAttachment
}): string | null {
  const { instruction, attachment } = input
  const usage = attachment.usage
  if (!usage) return null
  const body = attachment.content.trim()
  if (!body) return null

  if (usage === "edit") {
    const lead = instruction.trim() || "请优化修改下面这篇文案，直接给出可发布终稿。"
    return `${lead}\n\n【待修改原文】\n${body}`
  }

  if (usage === "benchmark") {
    const lead = instruction.trim() || "请按对标原文重新生成一版文案，直接输出最终稿。"
    return `${lead}\n\n对标原文：\n${body}`
  }

  return null
}

export function canSubmitWithPasteAttachment(input: {
  text: string
  attachment: PastedCopyAttachment | null
  hasImages?: boolean
}): boolean {
  const { text, attachment, hasImages } = input
  if (attachment && !attachment.usage) return false
  if (attachment?.usage === "style_sample") return false
  return text.trim().length > 0 || Boolean(attachment) || Boolean(hasImages)
}

export const PASTE_COMPOSER_PLACEHOLDER =
  "粘贴选题、原稿、老板口述或对标文案，也可以直接说你想写什么……"
