import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MarkdownRenderer } from "@/components/markdown-renderer"

const source = readFileSync(join(process.cwd(), "src/components/markdown-renderer.tsx"), "utf8")

describe("MarkdownRenderer empty content", () => {
  it("does not render 暂无 for empty streaming placeholders", () => {
    expect(source).toContain("if (!content.trim()) return null")
    expect(source).not.toContain("暂无")
  })

  it("preserves block and inline markdown rendering", () => {
    const html = renderToStaticMarkup(createElement(MarkdownRenderer, {
      content: "## 重点\n- **第一条**\n1. `步骤一`\n> 这里是提醒\n---\n查看[来源](https://example.com)",
    }))

    expect(html).toContain("<h2")
    expect(html).toContain("<strong")
    expect(html).toContain("list-disc")
    expect(html).toContain("list-decimal")
    expect(html).toContain("<blockquote")
    expect(html).toContain("<hr")
    expect(html).toContain("https://example.com")
  })
})
