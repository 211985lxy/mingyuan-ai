"use client"

import { Fragment } from "react"

interface MarkdownRendererProps {
  content: string
  className?: string
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
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  if (!content.trim()) return null

  const elements: React.ReactNode[] = []
  let key = 0
  for (const line of content.split("\n")) {
    if (!line.trim()) continue
    elements.push(renderBlockLine(line.trim(), key++))
  }

  if (elements.length === 0) return null

  return <div className={`space-y-2 ${className}`}>{elements}</div>
}

function renderBlockLine(line: string, key: number): React.ReactNode {
  if (/^## (.+)/.test(line)) {
    return <h2 key={key} className="mb-3 mt-5 text-lg sm:text-xl font-bold text-foreground first:mt-0">{renderInline(line.replace(/^## /, ""))}</h2>
  }
  if (/^### (.+)/.test(line)) {
    return <h3 key={key} className="mb-2 mt-4 text-base font-semibold text-foreground">{renderInline(line.replace(/^### /, ""))}</h3>
  }
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
    return <hr key={key} className="my-4 border-t border-border" />
  }
  if (/^[-*]\s+(.+)/.test(line)) {
    return <li key={key} className="ml-4 list-disc text-sm sm:text-[15px] leading-7 text-muted-foreground [&_strong]:text-foreground">{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
  }
  if (/^\d+[.)]\s+(.+)/.test(line)) {
    return <li key={key} className="ml-5 list-decimal text-sm sm:text-[15px] leading-7 text-muted-foreground [&_strong]:text-foreground">{renderInline(line.replace(/^\d+[.)]\s+/, ""))}</li>
  }
  if (/^>\s+(.+)/.test(line)) {
    return <blockquote key={key} className="border-l-4 border-primary/30 pl-3 my-2 text-sm sm:text-[15px] leading-7 text-muted-foreground italic">{renderInline(line.replace(/^>\s+/, ""))}</blockquote>
  }
  return <p key={key} className="text-sm sm:text-[15px] leading-7 text-muted-foreground [&_strong]:text-foreground">{renderInline(line)}</p>
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
    if (linkMatch) candidates.push({ index: linkMatch.index!, length: linkMatch[0].length, render: <a key={key++} href={linkMatch[2]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">{linkMatch[1]}</a> })
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
