/** 交付物导出：把文案内容打包成 .md 文件并触发浏览器下载。 */

/**
 * 取本地时区 YYYY-MM-DD。toISOString 是 UTC 时间，接近午夜导出会让文件名日期偏移一天。
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function buildMarkdownFilename(title?: string): string {
  const base = (title ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    // 截断可能正好落在分隔符上，留下首/尾连字符，需在截断后再清理一次
    .replace(/^-+|-+$/g, "")
  const date = toLocalDateString(new Date())
  return `${base || "aim-content"}-${date}.md`
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
