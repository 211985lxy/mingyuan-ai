import { env } from "@/env"
// ─── 微信公众号 HTML 转换 ─────────────────────────────────
// 主路径：调用 baoyu-markdown-to-html（bun/npx）
// Fallback：内置最小 Markdown → 微信安全 HTML 转换器

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { existsSync } from "node:fs"

const execFileAsync = promisify(execFile)

// baoyu-markdown-to-html 脚本路径（优先检测）
const BAOYU_SCRIPT_PATH =
  env.BAOYU_MD2HTML_SCRIPT ||
  "/Users/xiangyu/.codex/skills/baoyu-markdown-to-html/scripts/main.ts"

/** HTML 允许的白名单标签（微信图文消息支持的标签子集） */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "ol",
  "ul",
  "li",
  "a",
  "img",
  "hr",
  "section",
])

const VOID_ELEMENTS = new Set(["br", "hr", "img"])

export interface WechatHtmlConvertResult {
  html: string
  warnings: string[]
}

/**
 * 主入口：Markdown → 微信 HTML
 * 优先使用 baoyu-markdown-to-html，不可用时 fallback 到内置转换器
 */
/**
 * @description markdowntowechathtml
 * @param markdown - markdown
 * @param options? - options?
 * @returns Promise<WechatHtmlConvertResult>
 */
export async function markdownToWechatHtml(
  markdown: string,
  options?: {
    theme?: string
    color?: string
    fontSize?: string
  },
): Promise<WechatHtmlConvertResult> {
  if (!markdown || !markdown.trim()) {
    throw new Error("markdown 内容不能为空")
  }

  const theme = options?.theme || "modern"
  const color = options?.color || "blue"
  const fontSize = options?.fontSize || "16px"

  // 尝试 baoyu-markdown-to-html
  if (existsSync(BAOYU_SCRIPT_PATH)) {
    try {
      return await convertWithBaoyuScript(markdown, theme, color, fontSize)
    } catch (err) {
      return {
        html: minimalMarkdownToHtml(markdown),
        warnings: [
          `baoyu-markdown-to-html 调用失败，使用内置转换器: ${err instanceof Error ? err.message : String(err)}`,
        ],
      }
    }
  }

  // Fallback：内置最小转换器
  return {
    html: minimalMarkdownToHtml(markdown),
    warnings: ["baoyu-markdown-to-html 脚本不可用，使用内置最小转换器"],
  }
}

/** 调用 baoyu-markdown-to-html 脚本 */
async function convertWithBaoyuScript(
  markdown: string,
  theme: string,
  color: string,
  fontSize: string,
): Promise<WechatHtmlConvertResult> {
  // 将 markdown 写入临时文件
  const { writeFile, readFile, unlink, mkdtemp } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")

  const tmpDir = await mkdtemp(join(tmpdir(), "wechat-html-"))
  const mdFile = join(tmpDir, "article.md")
  const htmlFile = join(tmpDir, "article.html")

  try {
    await writeFile(mdFile, markdown, "utf8")

    // 解析 bun 路径
    const bunPath = resolveBunPath()

    const args = [
      BAOYU_SCRIPT_PATH,
      mdFile,
      "--theme", theme,
      "--color", color,
      "--font-size", fontSize,
    ]

    await execFileAsync(bunPath, args, {
      cwd: tmpDir,
      timeout: 30000,
    })

    const html = await readFile(htmlFile, "utf8")
    return { html, warnings: [] }
  } finally {
    // 清理临时文件
    try { await unlink(mdFile) } catch { /* ignore */ }
    try { await unlink(htmlFile) } catch { /* ignore */ }
    try { await import("node:fs/promises").then(f => f.rmdir(tmpDir)) } catch { /* ignore */ }
  }
}

/** 解析 bun 可执行路径 */
function resolveBunPath(): string {
  try {
    // 检查 bun 是否在 PATH 中
    const result = require("node:child_process").execSync("which bun 2>/dev/null || true", {
      encoding: "utf8",
    }).trim()
    if (result) return result
  } catch {
    // ignore
  }
  // fallback to npx -y bun
  return "npx"
}

// ─── 内置最小 Markdown → 微信 HTML 转换器 ────────────

/** HTML escape：防 XSS */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * 最小 Markdown → 微信安全 HTML
 * 支持：段落、标题(h1-h3)、引用、有序/无序列表、加粗、斜体、图片、链接、分隔线、换行
 * 链接转纯文本（微信不支持外链）
 */
/**
 * @description minimalmarkdowntohtml
 * @param markdown - markdown
 * @returns string
 */
export function minimalMarkdownToHtml(markdown: string): string {
  const lines = markdown.split("\n")
  const output: string[] = []
  let inList = false
  let listType: "ul" | "ol" | null = null
  let inBlockquote = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 空行：关闭当前块
    if (!trimmed) {
      if (inBlockquote) { output.push("</blockquote>"); inBlockquote = false }
      if (inList) { output.push(listType === "ol" ? "</ol>" : "</ul>"); inList = false; listType = null }
      continue
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      if (inBlockquote) { output.push("</blockquote>"); inBlockquote = false }
      if (inList) { output.push(listType === "ol" ? "</ol>" : "</ul>"); inList = false; listType = null }
      output.push("<hr/>")
      continue
    }

    // 引用
    if (trimmed.startsWith(">")) {
      if (inList) { output.push(listType === "ol" ? "</ol>" : "</ul>"); inList = false; listType = null }
      if (!inBlockquote) { output.push("<blockquote>"); inBlockquote = true }
      const quoteContent = trimmed.replace(/^>\s?/, "")
      output.push(`<p>${inlineFormat(escapeHtml(quoteContent))}</p>`)
      continue
    } else if (inBlockquote) {
      output.push("</blockquote>")
      inBlockquote = false
    }

    // 标题
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      if (inList) { output.push(listType === "ol" ? "</ol>" : "</ul>"); inList = false; listType = null }
      const level = headingMatch[1].length
      const content = inlineFormat(escapeHtml(headingMatch[2].trim()))
      output.push(`<h${level}>${content}</h${level}>`)
      continue
    }

    // 无序列表
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)/)
    if (ulMatch) {
      if (inList && listType !== "ul") { output.push("</ol>"); inList = false }
      if (!inList) { output.push("<ul>"); inList = true; listType = "ul" }
      output.push(`<li>${inlineFormat(escapeHtml(ulMatch[1]))}</li>`)
      continue
    }

    // 有序列表
    const olMatch = trimmed.match(/^\d+\.\s+(.+)/)
    if (olMatch) {
      if (inList && listType !== "ol") { output.push("</ul>"); inList = false }
      if (!inList) { output.push("<ol>"); inList = true; listType = "ol" }
      output.push(`<li>${inlineFormat(escapeHtml(olMatch[1]))}</li>`)
      continue
    }

    // 关闭未结束的列表
    if (inList) { output.push(listType === "ol" ? "</ol>" : "</ul>"); inList = false; listType = null }

    // 普通段落
    output.push(`<p>${inlineFormat(escapeHtml(trimmed))}</p>`)
  }

  // 关闭所有未结束的块
  if (inBlockquote) output.push("</blockquote>")
  if (inList) output.push(listType === "ol" ? "</ol>" : "</ul>")

  return output.join("\n")
}

/** 行内格式处理：加粗、斜体、图片（仅占位）、链接转纯文本 */
function inlineFormat(text: string): string {
  // 图片占位：【配图：描述】→ <img> 带 alt
  text = text.replace(
    /【配图[：:]\s*(.+?)】/g,
    (_, desc) => `<img src="" alt="${desc}" data-placeholder="true"/>`,
  )

  // 标准 markdown 图片
  text = text.replace(
    /!\[([^\]]*)\]\([^)]+\)/g,
    (_, alt) => `<img src="" alt="${alt}" data-placeholder="true"/>`,
  )

  // 加粗 **text** 或 __text__
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>")

  // 斜体 *text* 或 _text_
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
  text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "<em>$1</em>")

  // 链接转纯文本：微信不支持外链
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

  // 行内代码 → 粗体（微信不支持 code 标签）
  text = text.replace(/`([^`]+)`/g, "<strong>$1</strong>")

  return text
}

/**
 * 消毒 HTML：移除白名单以外的标签和属性
 * 用于处理 LLM 直接输出 HTML 的情况
 */
/**
 * @description sanitizewechathtml
 * @param html - HTML 内容
 * @returns string
 */
export function sanitizeWechatHtml(html: string): string {
  // 先 escape 全部内容
  let escaped = escapeHtml(html)

  // 恢复白名单标签
  for (const tag of ALLOWED_TAGS) {
    if (VOID_ELEMENTS.has(tag)) {
      // 自闭合标签
      const re = new RegExp(`&lt;${tag}\\b([^]*?)&gt;`, "gi")
      escaped = escaped.replace(re, `<${tag}$1/>`)
    } else {
      // 开标签
      const openRe = new RegExp(`&lt;${tag}\\b([^]*?)&gt;`, "gi")
      escaped = escaped.replace(openRe, `<${tag}$1>`)
      // 闭标签
      const closeRe = new RegExp(`&lt;/${tag}&gt;`, "gi")
      escaped = escaped.replace(closeRe, `</${tag}>`)
    }
  }

  return escaped
}
