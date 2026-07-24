"use client"

import { Fragment } from "react"

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * @description 安全校验 Markdown 链接的 href，过滤非法协议（仅允许 http/https/mailto 和相对路径）
 * @param value - 原始链接地址
 * @returns 安全的 href 值，非法时返回 null
 */
export function safeMarkdownHref(value: string): string | null {
  const href = value.trim()
  if (href.startsWith("/") || href.startsWith("#")) return href
  try {
    const parsed = new URL(href)
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? href : null
  } catch {
    return null
  }
}

/**
 * Lightweight Markdown renderer — no external dependencies.
 * Supports the patterns that AI analysis output typically uses:
 *   ## 标题 / ### 标题
 *   **加粗**
 *   列表项 ( - / * )
 *   数字列表 ( 1. )
 *   行内代码
 *   分隔符 ---
 *
 * 普通正文按空行分段（口播短句不会每行都撑出大段距）；段内软换行保留。
 */
/**
 * @description markdownrenderer
 * @param options - 配置选项
 * @returns 无返回值
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  if (!content.trim()) return null

  const elements: React.ReactNode[] = []
  let key = 0
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return
    const text = paragraphLines.join("\n")
    elements.push(
      <p key={key++} className="whitespace-pre-line text-base leading-7 text-foreground/90 [&_strong]:text-foreground">
        {renderInline(text)}
      </p>,
    )
    paragraphLines = []
  }

  for (const raw of content.split("\n")) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      continue
    }

    const isSpecial =
      /^##\s+/.test(trimmed) ||
      /^###\s+/.test(trimmed) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
      /^[-*]\s+/.test(trimmed) ||
      /^\d+[.)]\s+/.test(trimmed) ||
      /^>\s+/.test(trimmed)

    if (isSpecial) {
      flushParagraph()
      elements.push(renderBlockLine(trimmed, key++))
      continue
    }

    paragraphLines.push(trimmed)
  }
  flushParagraph()

  if (elements.length === 0) return null

  return <div className={`space-y-2 ${className}`}>{elements}</div>
}

function renderBlockLine(line: string, key: number): React.ReactNode {
  if (/^## (.+)/.test(line)) {
    return <h2 key={key} className="mb-2 mt-4 text-xl font-bold tracking-tight text-foreground first:mt-0 sm:text-2xl">{renderInline(line.replace(/^## /, ""))}</h2>
  }
  if (/^### (.+)/.test(line)) {
    return <h3 key={key} className="mb-1.5 mt-3 text-lg font-semibold text-foreground">{renderInline(line.replace(/^### /, ""))}</h3>
  }
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
    return <hr key={key} className="my-3 border-t border-border" />
  }
  if (/^[-*]\s+(.+)/.test(line)) {
    return <li key={key} className="ml-5 list-disc text-base leading-7 text-foreground/90 [&_strong]:text-foreground">{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
  }
  if (/^\d+[.)]\s+(.+)/.test(line)) {
    return <li key={key} className="ml-5 list-decimal text-base leading-7 text-foreground/90 [&_strong]:text-foreground">{renderInline(line.replace(/^\d+[.)]\s+/, ""))}</li>
  }
  if (/^>\s+(.+)/.test(line)) {
    return <blockquote key={key} className="my-2 border-l-4 border-primary/30 pl-4 text-base leading-7 text-foreground/80 italic">{renderInline(line.replace(/^>\s+/, ""))}</blockquote>
  }
  return <p key={key} className="text-base leading-7 text-foreground/90 [&_strong]:text-foreground">{renderInline(line)}</p>
}

/**
 * Renders inline Markdown tokens within a text string:
 * **bold**, *italic*, `code`, [link](url)
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    // Inline code: `code`
    const codeMatch = remaining.match(/`(.+?)`/)
    // Link: [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)
    // Italic: *text* (only single asterisk, not double)
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/)

    // Find the nearest token
    const candidates: { index: number; length: number; render: React.ReactNode }[] = []

    if (boldMatch) candidates.push({ index: boldMatch.index!, length: boldMatch[0].length, render: <strong key={key++}>{renderInline(boldMatch[1])}</strong> })
    if (codeMatch) candidates.push({ index: codeMatch.index!, length: codeMatch[0].length, render: <code key={key++} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{codeMatch[1]}</code> })
    if (linkMatch) {
      const href = safeMarkdownHref(linkMatch[2])
      candidates.push({
        index: linkMatch.index!,
        length: linkMatch[0].length,
        render: href
          ? <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">{linkMatch[1]}</a>
          : <span key={key++}>{linkMatch[1]}</span>,
      })
    }
    if (italicMatch) candidates.push({ index: italicMatch.index!, length: italicMatch[0].length, render: <em key={key++}>{italicMatch[1]}</em> })

    if (candidates.length === 0) {
      // No more tokens — emit the rest as plain text
      parts.push(remaining)
      break
    }

    // Pick the earliest token
    candidates.sort((a, b) => a.index - b.index)
    const nearest = candidates[0]

    // Emit text before the token
    if (nearest.index > 0) {
      parts.push(remaining.slice(0, nearest.index))
    }

    // Emit the rendered token
    parts.push(nearest.render)

    // Advance past the token
    remaining = remaining.slice(nearest.index + nearest.length)
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <Fragment>{parts}</Fragment>
}
