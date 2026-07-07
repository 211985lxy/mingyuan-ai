export interface TextSelectionRange {
  start: number
  end: number
}

export const EDITOR_PANEL_MIN_WIDTH = 280
export const EDITOR_PANEL_MAX_WIDTH = 460
export const EDITOR_PANEL_DEFAULT_WIDTH = 360

export function applySelectionReplacement(
  text: string,
  selection: TextSelectionRange,
  replacement: string
) {
  if (selection.end <= selection.start) return text
  const start = Math.max(0, Math.min(selection.start, text.length))
  const end = Math.max(start, Math.min(selection.end, text.length))
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`
}

export function clampEditorPanelWidth(width: number) {
  if (!Number.isFinite(width)) return EDITOR_PANEL_DEFAULT_WIDTH
  return Math.min(EDITOR_PANEL_MAX_WIDTH, Math.max(EDITOR_PANEL_MIN_WIDTH, Math.round(width)))
}

export function extractReplacementDraft(text: string) {
  const match = text.match(/(?:^|\n)替换稿[：:]\s*([\s\S]*)$/)
  return match?.[1]?.trim() ?? ""
}

export function extractEditorDraftFromAssistantText(text: string) {
  const patterns = [
    /(?:^|\n)#{1,6}\s*编辑区\s*[-—－]\s*最终版口播文案\s*\n+([\s\S]*)$/m,
    /(?:^|\n)编辑区\s*[-—－]\s*最终版口播文案\s*\n+([\s\S]*)$/m,
    /(?:^|\n)(?:最终版口播文案|最新版口播文案|最终稿|最新版)[：:]\s*\n*([\s\S]*)$/m,
  ]
  const match = patterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean)
  if (!match) return ""
  return match
    .replace(/\n{2,}(?:整体可感知重写比例|改写说明|备注|下一步)[：:][\s\S]*$/m, "")
    .trim()
}

export function extractStructureLabelsFromAnalysis(markdown: string) {
  const lines = markdown.split("\n")
  const structureStart = lines.findIndex((line) => /^##\s*结构拆解/.test(line.trim()))
  const sectionLines = structureStart >= 0
    ? lines.slice(structureStart + 1, lines.findIndex((line, index) => index > structureStart && /^##\s+/.test(line.trim())) >= 0
      ? lines.findIndex((line, index) => index > structureStart && /^##\s+/.test(line.trim()))
      : undefined)
    : lines

  const headingLabels = sectionLines
    .map((line) => line.trim().match(/^#{3,6}\s+(.+)$/)?.[1]?.trim())
    .filter((label): label is string => Boolean(label))
    .map((label) => label.replace(/\*\*/g, ""))
    .slice(0, 12)

  if (headingLabels.length > 0) return headingLabels

  return sectionLines
    .map((line) => line.trim().match(/^(?:[-*]|\d+[.、])\s*(?:\*\*)?([^：:\n]{2,40}[：:][^。\n]{0,80})/)?.[1]?.trim())
    .filter((label): label is string => Boolean(label))
    .map((label) => label.replace(/\*\*/g, ""))
    .slice(0, 12)
}

function findQuoteIndex(text: string, quote: string) {
  const cleanQuote = quote.replace(/[“”"]/g, "").trim()
  if (cleanQuote.length < 6) return -1
  if (!cleanQuote.includes("...")) return text.indexOf(cleanQuote)
  const parts = cleanQuote.split("...").map((part) => part.trim()).filter((part) => part.length >= 4)
  const first = parts[0]
  if (!first) return -1
  const index = text.indexOf(first)
  if (index < 0) return -1
  return parts.slice(1).every((part) => text.indexOf(part, index + first.length) >= 0) ? index : -1
}

function cleanStructureQuoteLine(line: string) {
  return line
    .replace(/^[-*>#\d.、\s]+/, "")
    .replace(/^\*{0,2}内容\*{0,2}[：:]/, "")
    .trim()
}

function inferSequentialBodyMarkers(text: string) {
  const patterns = [
    { label: "正文-心法一：狩猎法", regex: /第一个[，,、\s]*狩猎法/ },
    { label: "正文-心法二：反推法", regex: /第二[，,、\s]*(?:有句狠话|反推法|真正的高手)/ },
    { label: "正文-心法三：辩论法", regex: /第三(?:招|个)?[，,、\s]*辩论法/ },
  ]
  const markers = patterns.flatMap(({ label, regex }) => {
    const match = text.match(regex)
    return match?.index == null ? [] : [{ label, quote: match[0], index: match.index }]
  })
  return markers.length === patterns.length ? markers : []
}

export function applyStructureLabelsToReference(text: string, markdown: string) {
  if (!text.trim() || !markdown.trim() || /^#{1,6}\s+/m.test(text)) return text

  const lines = markdown.split("\n")
  const structureStart = lines.findIndex((line) => /^##\s*结构拆解/.test(line.trim()))
  const structureEnd = structureStart >= 0
    ? lines.findIndex((line, index) => index > structureStart && /^##\s+/.test(line.trim()))
    : -1
  const sectionLines = structureStart >= 0
    ? lines.slice(structureStart + 1, structureEnd >= 0 ? structureEnd : undefined)
    : lines

  const markers: Array<{ label: string; quote: string; index: number }> = []
  let currentLabel = ""
  let body: string[] = []

  const flush = () => {
    const quote = body
      .map(cleanStructureQuoteLine)
      .find((line) => findQuoteIndex(text, line) >= 0)
    const index = quote ? findQuoteIndex(text, quote) : -1
    if (currentLabel && quote && index >= 0) markers.push({ label: currentLabel, quote, index })
  }

  for (const line of sectionLines) {
    const trimmed = line.trim()
    const heading = (
      trimmed.match(/^#{3,6}\s+(.+)$/)?.[1]
      || trimmed.match(/^\d+[.、]\s*(.+)$/)?.[1]
    )?.replace(/\*\*/g, "").trim()
    if (heading) {
      flush()
      currentLabel = heading
      body = []
    } else if (currentLabel) {
      body.push(line)
    }
  }
  flush()

  const sortedMarkers = [...markers, ...inferSequentialBodyMarkers(text)]
    .filter((item, index, items) => items.findIndex((other) => other.index === item.index) === index)
    .sort((a, b) => a.index - b.index)

  if (sortedMarkers.length === 0) return text

  let output = ""
  let cursor = 0
  for (const marker of sortedMarkers) {
    output += text.slice(cursor, marker.index)
    output += `${output.trim() ? "\n\n" : ""}## ${marker.label}\n`
    cursor = marker.index
  }
  output += text.slice(cursor)
  return output
}

export function applyFirstMatchingStructureToReference(text: string, markdowns: string[]) {
  for (const markdown of markdowns) {
    const nextText = applyStructureLabelsToReference(text, markdown)
    if (nextText !== text) return nextText
  }
  return text
}

export interface AimEditorContext {
  action: string
  referenceSelection?: string
  draftSelection?: string
  draftText?: string
  documentType?: "copy" | "plan"
  referenceLabel?: string
  draftLabel?: string
}

export function formatEditorContextForPrompt(context?: AimEditorContext) {
  if (!context) return ""
  const isPlan = context.documentType === "plan"
  const referenceLabel = context.referenceLabel || (isPlan ? "参考材料" : "对标")
  const draftLabel = context.draftLabel || (isPlan ? "我的策划案" : "我的")
  return [
    isPlan
      ? "=== 策划案修改上下文（仅供本轮回复参考，不要复述整段原文） ==="
      : "=== 文案编辑上下文（仅供本轮回复参考，不要复述整段原文） ===",
    `用户动作：${context.action}`,
    context.referenceSelection ? `${referenceLabel}选区：\n${context.referenceSelection}` : null,
    context.draftSelection ? `${draftLabel}选区：\n${context.draftSelection}` : null,
    context.draftText ? `${draftLabel}当前稿：\n${context.draftText}` : null,
    isPlan
      ? "编辑原则：优先修改策划案结构、定位判断、内容策略、成交路径，不要按口播文案方式改写。"
      : "编辑原则：用户给出具体文案时，优先做定点修改；如果判断需要重写，先说明原因，再给替换稿。",
    isPlan
      ? "编辑原则：尽量保留已有业务判断和事实边界，把用户明确指出的策略方向改到位。"
      : "编辑原则：尽量保留原文有效的比喻、节奏和口语感，把用户明确指出的观点改到位。",
    isPlan
      ? "编辑原则：如果用户说“这里应该改成 X”，替换稿要围绕 X 改原段落的判断、结构或路径。"
      : "编辑原则：如果用户说“这里应该改成 X”，替换稿要围绕 X 改原句；例如把“帮客户写内容”改成“帮助客户沉淀可以进化的知识库资产”。",
    "编辑原则：替换稿只处理用户点名要改的地方；不要替换、删改用户没有点名的词句、工具名、结尾或结构。",
    "编辑原则：如果用户本轮只要求优化开头、前3秒、第一句话、钩子、起手或开场，替换稿只能包含新的开头段落；禁止把整篇文案放进替换稿。",
    "修改思路可以给开头、结构、结尾等简短意见，但要明确这些是可选建议，不要把未点名建议直接写进替换稿。",
    "回复格式固定为：\n修改思路：\n- ...\n\n替换稿：\n...",
    context.draftSelection
      ? `替换稿只改写“${draftLabel}选区”，不要重写整篇。`
      : `如果没有${draftLabel}选区，优先给可直接替换的段落；确实需要整段重写时要说明原因。`,
  ].filter(Boolean).join("\n\n")
}
