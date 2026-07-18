export interface ImageTextPage { id: string; title: string; body: string; note: string; imageUrl?: string }
export interface ImageTextDoc { header: string; pages: ImageTextPage[] }

const PAGE = /^(?:#*\s*)?(?:第\s*\d+\s*页|Page\s*\d+|【?(?:封面|尾页)】?)(?:\s*[:：|—-]\s*(.*))?$/i

export function parseImageTextDoc(source: string): ImageTextDoc {
  const header: string[] = []
  const raw: Array<{ title: string; lines: string[] }> = []
  let current: { title: string; lines: string[] } | null = null
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const marker = line.trim().match(PAGE)
    if (marker) { current = { title: marker[1]?.trim() ?? "", lines: [] }; raw.push(current); continue }
    if (current) current.lines.push(line)
    else header.push(line)
  }
  if (!raw.length) return { header: "", pages: [{ id: "page-1", title: "", body: source.trim(), note: "" }] }
  return {
    header: header.join("\n").trim(),
    pages: raw.map((page, index) => {
      const body: string[] = []; const notes: string[] = []
      for (const line of page.lines) {
        const match = line.trim().match(/^(?:配图|画面|提示词)\s*[:：]\s*(.*)$/)
        if (match) notes.push(match[1]); else body.push(line)
      }
      return { id: `page-${index + 1}`, title: page.title, body: body.join("\n").trim(), note: notes.join("\n").trim() }
    }),
  }
}

export function serializeImageTextDoc(header: string, pages: ImageTextPage[]): string {
  const blocks = pages.map((page, index) => {
    const lines = [`第 ${index + 1} 页${page.title.trim() ? `：${page.title.trim()}` : ""}`]
    if (page.body.trim()) lines.push(page.body.trim())
    if (page.note.trim()) lines.push(...page.note.split(/\r?\n/).filter(Boolean).map((note) => `配图：${note.trim()}`))
    return lines.join("\n")
  })
  return [header.trim(), ...blocks].filter(Boolean).join("\n\n")
}
