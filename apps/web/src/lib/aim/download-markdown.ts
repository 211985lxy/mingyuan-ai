/** 交付物导出：把文案内容打包成 .md 文件并触发浏览器下载。 */

export function buildMarkdownFilename(title?: string): string {
  const base = (title ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  const date = new Date().toISOString().slice(0, 10)
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
