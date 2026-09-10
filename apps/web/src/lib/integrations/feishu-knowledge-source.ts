/** 飞书来源卡片的纯数据形状与请求头编解码，前后端都能用。 */

export const FEISHU_SOURCE_HEADER = "x-aim-feishu-sources"

export interface FeishuKnowledgeSourceCard {
  title: string
  url: string
}

export function toFeishuSourceCards(sources: Array<{ title: string; url: string }>): FeishuKnowledgeSourceCard[] {
  return sources
    .map((item) => ({ title: item.title.trim(), url: item.url.trim() }))
    .filter((item) => item.title && item.url)
}

export function encodeFeishuSourceHeader(sources: FeishuKnowledgeSourceCard[]): string {
  return encodeURIComponent(JSON.stringify(toFeishuSourceCards(sources)))
}

export function decodeFeishuSourceHeader(raw?: string | null): FeishuKnowledgeSourceCard[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const record = item as Record<string, unknown>
      const title = typeof record.title === "string" ? record.title.trim().slice(0, 80) : ""
      const url = typeof record.url === "string" ? record.url.trim() : ""
      if (!title || !url) return []
      return [{ title, url }]
    })
  } catch {
    return []
  }
}
