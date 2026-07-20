/** 安全的公众号 Markdown → 内联样式 HTML 转换器。 */
export type WechatThemeId = "classic_blue" | "graphite"

const THEMES: Record<WechatThemeId, { accent: string; text: string; heading: string }> = {
  classic_blue: { accent: "#0F4C81", text: "#3f3f3f", heading: "#1a1a1a" },
  graphite: { accent: "#333333", text: "#463f3a", heading: "#111111" },
}

/**
 * @description escapehtml
 * @param text - 文本
 * @returns string
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function inline(text: string, accent: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${accent};">$1</strong>`)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
}

/**
 * @description markdowntowechathtml
 * @param markdown - markdown
 * @param themeId - 主题唯一标识符
 * @returns string
 */
export function markdownToWechatHtml(markdown: string, themeId: WechatThemeId = "classic_blue"): string {
  const theme = THEMES[themeId]
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const html: string[] = []
  let list: "ul" | "ol" | null = null
  const closeList = () => {
    if (list) html.push(`</${list}>`)
    list = null
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { closeList(); continue }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      html.push(`<h${level} style="color:${theme.heading};font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;">${inline(heading[2], theme.accent)}</h${level}>`)
      continue
    }
    if (/^-{3,}$/.test(line)) { closeList(); html.push(`<hr style="border:0;border-top:1px solid ${theme.accent};"/>`); continue }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) { closeList(); html.push(`<blockquote style="border-left:3px solid ${theme.accent};padding:8px 12px;color:${theme.text};">${inline(quote[1], theme.accent)}</blockquote>`); continue }
    const unordered = line.match(/^[-*+]\s+(.+)$/)
    const ordered = line.match(/^\d+\.\s+(.+)$/)
    if (unordered || ordered) {
      const nextList = unordered ? "ul" : "ol"
      if (list !== nextList) { closeList(); html.push(`<${nextList} style="color:${theme.text};">`); list = nextList }
      html.push(`<li>${inline((unordered ?? ordered)![1], theme.accent)}</li>`)
      continue
    }
    closeList()
    html.push(`<p style="color:${theme.text};font-size:16px;line-height:1.8;">${inline(line, theme.accent)}</p>`)
  }
  closeList()
  return html.join("\n")
}

/**
 * @description 构建wechatclipboardpayload
 * @param markdown - markdown
 * @param themeId? - 主题Id?
 * @returns 无返回值
 */
export function buildWechatClipboardPayload(markdown: string, themeId?: WechatThemeId) {
  const html = markdownToWechatHtml(markdown, themeId)
  return { html, text: markdown }
}
