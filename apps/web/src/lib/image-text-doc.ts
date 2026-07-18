/**
 * 小红书图文稿 ↔ 结构化文档（纯函数，零依赖，可单测）
 *
 * 画布是 editorText 的结构化视图：parse 把「第 1 页/第 2 页…」式文稿拆成
 * header（首个页标记之前的笔记标题/正文/话题）+ 逐页 {title, body, note}；
 * serialize 用固定范式回写，保证 parse→serialize→parse 幂等（单测断言）。
 *
 * 解析规则（启发式，宁稳勿滥）：
 * - 页标记（行首，允许 markdown 标题前缀 #）：
 *   第 N 页 / Page N / P N（需分隔符）/ 裸「封面」「封面页」「尾页」行；
 *   尾随的分隔符（：:｜|-—·.）后文本作为页标题；（封面）等角色括注会被剥掉。
 * - 页内「标签：内容」行：
 *   标题类（标题/主标题/图上文案/主文案/大字/封面标题/主题…）→ title
 *   配图类（配图/配图脚本/画面/画面描述/视觉提示词/生图提示词/拍摄/分镜…）→ note
 *   正文类（副标题/正文/补充文案/说明/要点/核心文案…）→ body（剥掉标签）
 * - 无标签行一律进 body；标题不做「首行提升」——只来自页标记尾随和标题类标签，
 *   这是往返幂等的关键（否则空标题页的首行正文会在 re-parse 时被误提升）。
 * - 解析不出任何页结构时：整体作为 1 页（body=全文），header 为空。
 */

export interface ImageTextPage {
  id: string
  /** 页标题 / 图上主文案 */
  title: string
  /** 页内补充文案 */
  body: string
  /** 配图脚本 / 画面描述（喂给生图的素材） */
  note: string
  imageUrl?: string
}

export interface ImageTextDoc {
  header: string
  pages: ImageTextPage[]
}

// ─── 页标记识别 ──────────────────────────────────────────

const RE_MD_HEADING = /^#{1,6}\s+/
const RE_PAGE_CN = /^第\s*\d{1,2}\s*页/
const RE_PAGE_EN = /^page\s*\d{1,2}\b/i
const RE_PAGE_P = /^p\d{1,2}\s*[:：｜]/i
// 裸角色页：「【封面】」「封面：」「尾页」等；后随分隔符或行尾，避免误伤「封面的三个方法」
const RE_COVER = /^【?(?:封面页?|尾页)】?(?=\s*[:：｜|\-—·.]|\s*$)/
const RE_SEPARATOR_PREFIX = /^[：:｜|\-—·.\s]+/
const RE_ROLE_PAREN = /[（(](?:封面|封面页|内页|尾页)[）)]/g
const RE_ROLE_PREFIX = /^(?:封面|封面页|内页|尾页)\s*[:：｜|\-—·.]\s*/

/** 判断一行是否页标记；是则返回标记行上的标题候选文本 */
function matchPageMarker(line: string): { trailing: string } | null {
  const text = line.trim().replace(RE_MD_HEADING, "").trim()
  const match =
    text.match(RE_PAGE_CN) || text.match(RE_PAGE_EN) || text.match(RE_PAGE_P) || text.match(RE_COVER)
  if (!match) return null
  let trailing = text.slice(match[0].length)
  trailing = trailing.replace(RE_SEPARATOR_PREFIX, "").replace(RE_ROLE_PAREN, "").trim()
  // 角色括注后可能还有分隔符（如「第 1 页（内页）：真正的标题」）
  trailing = trailing.replace(RE_SEPARATOR_PREFIX, "").trim()
  // 角色词 + 分隔符 + 真标题（如「第 1 页｜封面：钩子标题」）
  trailing = trailing.replace(RE_ROLE_PREFIX, "").trim()
  return { trailing }
}

// ─── 页内标签识别 ──────────────────────────────────────────

const TITLE_LABELS = new Set([
  "标题", "页标题", "主标题", "图上文案", "主文案", "大字", "封面标题", "封面主标题", "主题",
])
const NOTE_LABELS = new Set([
  "配图", "配图脚本", "配图建议", "画面", "画面描述", "视觉", "视觉提示词", "构图",
  "生图提示词", "提示词", "拍摄", "分镜", "图片",
])
const BODY_LABELS = new Set([
  "副标题", "正文", "补充", "补充文案", "文案", "说明", "要点", "核心文案", "描述",
])

const RE_LABELED_LINE = /^([一-龥A-Za-z]{1,8})\s*[:：]\s*(.+)$/

type Bucket = "title" | "body" | "note" | null

function classifyContentLine(line: string): { bucket: Bucket; content: string } {
  const match = line.match(RE_LABELED_LINE)
  if (!match) return { bucket: "body", content: line }
  const [, label, content] = match
  if (TITLE_LABELS.has(label)) return { bucket: "title", content: content.trim() }
  if (NOTE_LABELS.has(label)) return { bucket: "note", content: content.trim() }
  if (BODY_LABELS.has(label)) return { bucket: "body", content: content.trim() }
  // 不在已知标签表里的「xx：yy」行保持原样进 body（如「时间：3 分钟」）
  return { bucket: "body", content: line }
}

// ─── parse / serialize ─────────────────────────────────

/**
 * 把小红书图文稿解析为 header + 逐页结构。
 * 页 id 按顺序生成（page-1…），画布编辑期间保持稳定（重排移动的是对象本身）。
 */
export function parseImageTextDoc(source: string): ImageTextDoc {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")

  const headerLines: string[] = []
  const rawPages: Array<{ trailing: string; lines: string[] }> = []
  let current: { trailing: string; lines: string[] } | null = null

  for (const raw of lines) {
    const line = raw.trim()
    const marker = matchPageMarker(line)
    if (marker) {
      current = { trailing: marker.trailing, lines: [] }
      rawPages.push(current)
      continue
    }
    if (current) {
      current.lines.push(line)
    } else {
      headerLines.push(raw)
    }
  }

  // 无页结构：整体作为 1 页
  if (rawPages.length === 0) {
    const body = source.replace(/\r\n?/g, "\n").trim()
    return {
      header: "",
      pages: [{ id: "page-1", title: "", body, note: "" }],
    }
  }

  const pages = rawPages.map((rawPage, index) => {
    let title = rawPage.trailing
    const bodyLines: string[] = []
    const noteLines: string[] = []
    for (const line of rawPage.lines) {
      if (!line) {
        // 保留 body 内部的段落空行（首尾空行最后统一 trim）
        if (bodyLines.length > 0) bodyLines.push("")
        continue
      }
      const { bucket, content } = classifyContentLine(line)
      if (bucket === "title") {
        if (title) {
          // 已有标题（页标记尾随）：多余的标题行降入 body
          bodyLines.push(content)
        } else {
          title = content
        }
      } else if (bucket === "note") {
        noteLines.push(content)
      } else {
        bodyLines.push(content)
      }
    }
    return {
      id: `page-${index + 1}`,
      title: title.trim(),
      body: bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      note: noteLines.join("\n").trim(),
    }
  })

  return { header: headerLines.join("\n").trim(), pages }
}

/**
 * 无损回写为原文风格的文本（canonical 范式）：
 * - header 原样置首，空行分隔
 * - 每页「第 N 页[：标题]」+ body 原样行 + 每行 note 加「配图：」前缀
 * - 完全无结构（单页、无 header/title/note）时直出 body，与原文一致
 * 该范式可被 parse 精确读回，保证 parse→serialize→parse 幂等。
 */
export function serializeImageTextDoc(header: string, pages: ImageTextPage[]): string {
  const trimmedHeader = header.trim()
  const hasStructure =
    pages.length > 1 || trimmedHeader.length > 0 || pages.some((p) => p.title.trim() || p.note.trim())

  if (!hasStructure) {
    return (pages[0]?.body ?? "").trim()
  }

  const blocks: string[] = []
  if (trimmedHeader) blocks.push(trimmedHeader)

  pages.forEach((page, index) => {
    const lines: string[] = []
    const title = page.title.trim()
    lines.push(`第 ${index + 1} 页${title ? `：${title}` : ""}`)
    const body = page.body.replace(/\r\n?/g, "\n").trim()
    if (body) lines.push(body)
    const noteLines = page.note
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    for (const noteLine of noteLines) lines.push(`配图：${noteLine}`)
    blocks.push(lines.join("\n"))
  })

  return blocks.join("\n\n")
}
