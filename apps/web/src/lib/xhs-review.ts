export interface XhsReviewIssue { type: string; text: string; suggestion: string }
export interface XhsChecklistItem { item: string; status: "pass" | "warn" | "fail"; note: string }

const EMOJI = /\p{Extended_Pictographic}/gu
export const XHS_ABSOLUTE_TERMS = ["国家级", "世界级", "全网最低价", "第一", "唯一", "最强", "最好", "100%"] as const

/**
 * @description 计算emojidensity
 * @param text - 文本
 * @returns number
 */
export function computeEmojiDensity(text: string): number {
  const chars = text.replace(/\s/g, "")
  return chars ? Math.round(((text.match(EMOJI) ?? []).length / chars.length) * 1000) / 10 : 0
}

/**
 * @description 查找absoluteterms
 * @param text - 文本
 * @returns XhsReviewIssue[]
 */
export function findAbsoluteTerms(text: string): XhsReviewIssue[] {
  return XHS_ABSOLUTE_TERMS.filter((term) => text.includes(term)).map((term) => ({
    type: "absolute", text: `疑似绝对化用语「${term}」`, suggestion: "改成可验证、有限定条件的表达。",
  }))
}

/**
 * @description 构建localchecklist
 * @param title - 标题
 * @param content - 内容
 * @returns XhsChecklistItem[]
 */
export function buildLocalChecklist(title: string, content: string): XhsChecklistItem[] {
  const density = computeEmojiDensity(content)
  const absolute = findAbsoluteTerms(content)
  const titleLength = title.replace(EMOJI, "").trim().length
  const dense = content.split(/\r?\n\s*\r?\n/).some((p) => p.split("\n").filter(Boolean).length > 5)
  return [
    { item: "emoji", status: density > 3 ? "warn" : "pass", note: `emoji 密度 ${density}/百字` },
    { item: "absolute", status: absolute.length ? "fail" : "pass", note: absolute.length ? `命中 ${absolute.length} 处` : "未发现" },
    { item: "title", status: !titleLength || titleLength > 20 ? "warn" : "pass", note: `${titleLength} 字` },
    { item: "density", status: dense ? "warn" : "pass", note: dense ? "存在长段落" : "段落正常" },
  ]
}
