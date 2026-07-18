/**
 * 公众号文章样式渲染（纯函数，零依赖，可单测）
 *
 * 公众号后台粘贴能保留样式的关键是：全部样式内联（style 属性），
 * 不允许出现 class / 外链 CSS。因此本文件输出的 HTML 片段只使用内联样式。
 * 所有源文本先做 HTML 转义再套标签，防注入（编辑器内容直接来自用户稿件）。
 *
 * 主题样式移植自 doocs/md (WTFPL) —— https://github.com/doocs/md
 * 移植其内置三套主题的结构装饰（default 经典 / grace 优雅 / simple 简洁）
 * 与其官方配色（经典蓝 #0F4C81 / 玫瑰金 #B76E79 / 翡翠绿 #009874 / 石墨黑 #333333），
 * 并改写为纯内联样式输出（doocs 原版为 CSS 类 + CSS 变量体系）。
 */

/** 公众号后台友好的系统字体栈（苹果/安卓/PC 均能落到原生中文字体） */
const SYSTEM_FONT_STACK = `-apple-system,BlinkMacSystemFont,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif`

/** 标题/引用的结构装饰风格（移植自 doocs/md 各主题的装饰语言） */
export interface WechatThemeDecor {
  /** h2 装饰：band=白字色块居中（doocs default）| rounded=圆角色块（grace）| blob=8px 24px 异型圆角色块（simple） */
  h2: "band" | "rounded" | "blob"
  /** h3 装饰：borderLeft=左边框（default/grace）| panel=左边框+浅底色面板（simple） */
  h3: "borderLeft" | "panel"
  /** 引用装饰：block=左边框+底色块（default/grace）| minimal=细上下边框无底色（simple） */
  quote: "block" | "minimal"
  /** h1 装饰：underline=居中+下边框（doocs 三主题通用）| plain=左对齐 */
  h1: "underline" | "plain"
}

export interface WechatTheme {
  id: string
  label: string
  /** 正文字号 px（公众号常用 15-16） */
  fontSize: number
  /** 行高（公众号常用 1.75-2） */
  lineHeight: number
  /** 字体栈（系统字体即可，公众号后台会原样保留） */
  fontFamily: string
  /** 标题色 */
  headingColor: string
  /** 正文色 */
  textColor: string
  /** 强调色（粗体、三级标题、引用左边框），对应 doocs/md 的 --md-primary-color */
  accentColor: string
  /** 引用块底色 */
  quoteBackground: string
  /** 分割线颜色 */
  dividerColor: string
  /** 段间距 px */
  paragraphGap: number
  /** 结构装饰 */
  decor: WechatThemeDecor
}

export const WECHAT_THEMES: WechatTheme[] = [
  {
    // 移植 doocs/md default 主题（经典）× 官方配色「经典蓝」
    id: "classic_blue",
    label: "经典蓝",
    fontSize: 16,
    lineHeight: 1.75,
    fontFamily: SYSTEM_FONT_STACK,
    headingColor: "#1a1a1a",
    textColor: "#3f3f3f",
    accentColor: "#0F4C81",
    quoteBackground: "#f2f6fa",
    dividerColor: "#d6e0ee",
    paragraphGap: 16,
    decor: { h1: "underline", h2: "band", h3: "borderLeft", quote: "block" },
  },
  {
    // 移植 doocs/md grace 主题（优雅）× 官方配色「玫瑰金」
    id: "grace_rosegold",
    label: "优雅玫瑰金",
    fontSize: 16,
    lineHeight: 2,
    fontFamily: SYSTEM_FONT_STACK,
    headingColor: "#2b2325",
    textColor: "#3c3c3c",
    accentColor: "#B76E79",
    quoteBackground: "#faf5f6",
    dividerColor: "#e3d4d6",
    paragraphGap: 20,
    decor: { h1: "underline", h2: "rounded", h3: "borderLeft", quote: "block" },
  },
  {
    // 移植 doocs/md simple 主题（简洁）× 官方配色「翡翠绿」
    id: "simple_green",
    label: "简洁翡翠绿",
    fontSize: 15,
    lineHeight: 1.8,
    fontFamily: SYSTEM_FONT_STACK,
    headingColor: "#17352c",
    textColor: "#40464a",
    accentColor: "#009874",
    quoteBackground: "#eef7f3",
    dividerColor: "#d3e8db",
    paragraphGap: 16,
    decor: { h1: "underline", h2: "blob", h3: "panel", quote: "minimal" },
  },
  {
    // 移植 doocs/md default 主题结构 × 官方配色「石墨黑」（内敛极简）
    id: "graphite",
    label: "石墨黑",
    fontSize: 15,
    lineHeight: 1.75,
    fontFamily: SYSTEM_FONT_STACK,
    headingColor: "#111111",
    textColor: "#463f3a",
    accentColor: "#333333",
    quoteBackground: "#f5f5f4",
    dividerColor: "#dcdcdc",
    paragraphGap: 16,
    decor: { h1: "underline", h2: "band", h3: "borderLeft", quote: "block" },
  },
]

/** HTML 转义（先转义再套标签，源文本里的 <script> 等不会进入可执行位置） */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// ─── 轻量标记解析（手写，参照 version-timeline.tsx 自实现 diffLines 的先例）──

/** 支持的行级语法：# / ## / ### 标题、> 引用、- 无序列表、1. 有序列表、--- 分割线、普通段落 */
type LineKind = "blank" | "h1" | "h2" | "h3" | "quote" | "ul" | "ol" | "divider" | "text"

function classifyLine(line: string): LineKind {
  const trimmed = line.trim()
  if (!trimmed) return "blank"
  if (/^-{3,}$/.test(trimmed)) return "divider"
  if (trimmed.startsWith("### ")) return "h3"
  if (trimmed.startsWith("## ")) return "h2"
  if (trimmed.startsWith("# ")) return "h1"
  if (trimmed.startsWith(">")) return "quote"
  if (/^-\s+/.test(trimmed)) return "ul"
  if (/^\d+\.\s+/.test(trimmed)) return "ol"
  return "text"
}

interface ParsedBlock {
  kind: Exclude<LineKind, "blank">
  lines: string[]
}

/**
 * 按空行/语法类型分块：连续的引用、列表、普通行各合并为一个块；
 * 空行是硬分隔（空行分段），其前后的同类行不再合并；
 * 标题与分割线各自独立成块（导出以便单测）
 */
export function parseWechatBlocks(source: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  // 上一个有效行之后是否遇到过空行（遇到则阻断跨空行合并）
  let separatedByBlank = false
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim()
    const kind = classifyLine(line)
    if (kind === "blank") {
      separatedByBlank = true
      continue
    }
    const prev = blocks[blocks.length - 1]
    const mergeable = kind === "quote" || kind === "ul" || kind === "ol" || kind === "text"
    if (!separatedByBlank && mergeable && prev && prev.kind === kind) {
      prev.lines.push(line)
    } else {
      blocks.push({ kind, lines: [line] })
    }
    separatedByBlank = false
  }
  return blocks
}

/** 去掉行首的标记符号，取纯内容 */
function lineContent(line: string, kind: LineKind): string {
  switch (kind) {
    case "h1":
      return line.replace(/^#\s+/, "")
    case "h2":
      return line.replace(/^##\s+/, "")
    case "h3":
      return line.replace(/^###\s+/, "")
    case "quote":
      return line.replace(/^>\s?/, "")
    case "ul":
      return line.replace(/^-\s+/, "")
    case "ol":
      return line.replace(/^\d+\.\s+/, "")
    default:
      return line
  }
}

/** 行内语法：先整体转义，再处理 **粗体** 与 [链接](url)（* 不受转义影响） */
function renderInlineMarkup(text: string, theme: WechatTheme): string {
  return escapeHtml(text)
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      // 公众号不支持外链跳转，链接渲染为强调色文本并附原始地址（纯文本，无 <a> 跳转）
      `<span style="color:${theme.accentColor};">$1</span>`,
    )
    .replace(
      /\*\*([^*]+)\*\*/g,
      `<strong style="color:${theme.accentColor};font-weight:600;">$1</strong>`,
    )
}

function renderBlock(block: ParsedBlock, theme: WechatTheme): string {
  const { fontSize, lineHeight, fontFamily, headingColor, textColor, accentColor, quoteBackground, dividerColor, paragraphGap, decor } = theme
  switch (block.kind) {
    case "h1": {
      // doocs 三主题通用：居中 + 底部 2px 主色边框（display:table 让边框宽度贴合文字）
      const base = `font-size:${fontSize + 6}px;font-weight:700;line-height:1.4;color:${headingColor};font-family:${fontFamily};`
      const style =
        decor.h1 === "underline"
          ? `display:table;margin:${paragraphGap}px auto ${Math.round(paragraphGap / 2)}px;padding:0 1em 4px;border-bottom:2px solid ${accentColor};text-align:center;${base}`
          : `margin:${paragraphGap}px 0 ${Math.round(paragraphGap / 2)}px;${base}`
      return `<h1 style="${style}">${renderInlineMarkup(lineContent(block.lines[0], "h1"), theme)}</h1>`
    }
    case "h2": {
      const base = `font-size:${fontSize + 3}px;font-weight:700;line-height:1.4;font-family:${fontFamily};`
      let style: string
      if (decor.h2 === "rounded") {
        // doocs grace：圆角色块 + 白字
        style = `display:table;margin:${paragraphGap * 2}px auto ${paragraphGap}px;padding:0.3em 1em;border-radius:8px;background-color:${accentColor};color:#ffffff;text-align:center;${base}`
      } else if (decor.h2 === "blob") {
        // doocs simple：8px 24px 异型圆角色块 + 白字
        style = `display:table;margin:${paragraphGap * 2}px auto ${paragraphGap}px;padding:0.3em 1.2em;border-radius:8px 24px 8px 24px;background-color:${accentColor};color:#ffffff;text-align:center;${base}`
      } else {
        // doocs default：白字色块居中
        style = `display:table;margin:${paragraphGap * 2}px auto ${paragraphGap}px;padding:0 0.4em;background-color:${accentColor};color:#ffffff;text-align:center;${base}`
      }
      return `<h2 style="${style}">${renderInlineMarkup(lineContent(block.lines[0], "h2"), theme)}</h2>`
    }
    case "h3": {
      const content = renderInlineMarkup(lineContent(block.lines[0], "h3"), theme)
      if (decor.h3 === "panel") {
        // doocs simple：左边框 + 主色 8% 浅底面板
        return `<h3 style="margin:${paragraphGap}px 0 ${Math.round(paragraphGap / 2)}px;padding:6px 12px;border-left:4px solid ${accentColor};border-radius:6px;background-color:${quoteBackground};color:${headingColor};font-size:${fontSize + 1}px;font-weight:600;line-height:1.4;font-family:${fontFamily};">${content}</h3>`
      }
      // doocs default/grace：左边框
      return `<h3 style="margin:${paragraphGap}px 0 ${Math.round(paragraphGap / 2)}px;padding-left:8px;border-left:3px solid ${accentColor};color:${accentColor};font-size:${fontSize + 1}px;font-weight:600;line-height:1.4;font-family:${fontFamily};">${content}</h3>`
    }
    case "quote": {
      const inner = block.lines.map((line) => renderInlineMarkup(lineContent(line, "quote"), theme)).join("<br/>")
      if (decor.quote === "minimal") {
        // doocs simple：无底色，细上下边框
        return `<blockquote style="margin:${paragraphGap}px 0;padding:12px 16px;border-top:1px solid ${dividerColor};border-bottom:1px solid ${dividerColor};color:${textColor};font-style:italic;font-size:${fontSize - 1}px;line-height:${lineHeight};font-family:${fontFamily};">${inner}</blockquote>`
      }
      // doocs default/grace：左边框 + 底色 + 圆角
      return `<blockquote style="margin:${paragraphGap}px 0;padding:12px 16px;border-left:3px solid ${accentColor};border-radius:6px;background-color:${quoteBackground};color:${textColor};font-size:${fontSize - 1}px;line-height:${lineHeight};font-family:${fontFamily};">${inner}</blockquote>`
    }
    case "ul": {
      const items = block.lines
        .map((line) => `<li style="margin:4px 0;">${renderInlineMarkup(lineContent(line, "ul"), theme)}</li>`)
        .join("")
      return `<ul style="margin:${paragraphGap}px 0;padding-left:1.5em;color:${textColor};font-size:${fontSize}px;line-height:${lineHeight};font-family:${fontFamily};">${items}</ul>`
    }
    case "ol": {
      const items = block.lines
        .map((line) => `<li style="margin:4px 0;">${renderInlineMarkup(lineContent(line, "ol"), theme)}</li>`)
        .join("")
      return `<ol style="margin:${paragraphGap}px 0;padding-left:1.5em;color:${textColor};font-size:${fontSize}px;line-height:${lineHeight};font-family:${fontFamily};">${items}</ol>`
    }
    case "divider":
      // 用带 border 的空 section 模拟分割线（比 hr 在公众号后台更稳定）
      return `<section style="margin:${paragraphGap * 2}px 0;border-top:1px solid ${dividerColor};font-size:0;line-height:0;">&nbsp;</section>`
    case "text": {
      const inner = block.lines.map((line) => renderInlineMarkup(lineContent(line, "text"), theme)).join("<br/>")
      return `<p style="margin:0 0 ${paragraphGap}px;font-size:${fontSize}px;line-height:${lineHeight};color:${textColor};font-family:${fontFamily};letter-spacing:0.5px;">${inner}</p>`
    }
  }
}

/** 文章标题的内联样式 HTML（复制富文本时与正文一起写入） */
export function renderWechatTitleHtml(title: string, theme: WechatTheme): string {
  return `<h1 style="margin:0 0 ${theme.paragraphGap}px;font-size:${theme.fontSize + 8}px;font-weight:700;line-height:1.4;color:${theme.headingColor};font-family:${theme.fontFamily};">${escapeHtml(title)}</h1>`
}

/**
 * 把编辑器里的轻量标记文本转成公众号可粘贴的内联样式 HTML 片段。
 * 输出是一个 <section style="…"> 根容器包裹的完整片段，100% 内联样式。
 */
export function renderWechatHtml(source: string, theme: WechatTheme): string {
  const body = parseWechatBlocks(source).map((block) => renderBlock(block, theme)).join("")
  return `<section style="font-family:${theme.fontFamily};font-size:${theme.fontSize}px;line-height:${theme.lineHeight};color:${theme.textColor};">${body}</section>`
}

/** 含标题样式的完整文章 HTML（一键复制富文本用） */
export function renderWechatArticleHtml(title: string, source: string, theme: WechatTheme): string {
  const body = parseWechatBlocks(source).map((block) => renderBlock(block, theme)).join("")
  return `<section style="font-family:${theme.fontFamily};font-size:${theme.fontSize}px;line-height:${theme.lineHeight};color:${theme.textColor};">${renderWechatTitleHtml(title, theme)}${body}</section>`
}

/** 取正文第一个一级标题文本（无则 null），供标题输入框做默认值 */
export function extractWechatTitle(source: string): string | null {
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim()
    if (/^#\s+/.test(line)) {
      const title = line.replace(/^#\s+/, "").replace(/\*\*/g, "").trim()
      if (title) return title
    }
  }
  return null
}

/** 删除正文里第一处一级标题行（标题已在标题栏展示，避免预览/复制重复） */
export function stripFirstH1Line(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const index = lines.findIndex((line) => /^#\s+/.test(line.trim()))
  if (index < 0) return source
  lines.splice(index, 1)
  return lines.join("\n")
}

/** 纯文本版本（text/plain 剪贴板用）：去掉轻量标记符号 */
export function wechatPlainText(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,3}\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^-\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/^-{3,}$/, ""),
    )
    .join("\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** 按 id 取主题（未知 id 回退到第一套） */
export function getWechatTheme(themeId: string): WechatTheme {
  return WECHAT_THEMES.find((theme) => theme.id === themeId) ?? WECHAT_THEMES[0]
}

/**
 * P1 规范入口：Markdown → 公众号 HTML（纯函数，100% 内联样式，可单测）。
 * theme 传主题 id（classic_blue / grace_rosegold / simple_green / graphite，
 * 移植自 doocs/md 的 default / grace / simple 主题体系）。
 */
export function markdownToWechatHtml(md: string, theme: string): string {
  return renderWechatHtml(md, getWechatTheme(theme))
}

/** 字数统计 + 阅读时长预估（公众号经验值：约 400 字/分钟） */
export function estimateWechatReading(source: string): { chars: number; minutes: number } {
  const plain = wechatPlainText(source).replace(/\s/g, "")
  const chars = plain.length
  return { chars, minutes: Math.max(1, Math.round(chars / 400)) }
}
