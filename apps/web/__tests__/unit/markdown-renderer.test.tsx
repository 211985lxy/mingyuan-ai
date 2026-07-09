import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MarkdownRenderer } from "@/components/markdown-renderer"

describe("MarkdownRenderer", () => {
  it("renders headings and grouped lists as structured blocks", () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={`# 总结

## 重点
- 第一条
- 第二条

1. 步骤一
2. 步骤二`}
      />
    )

    expect(html).toContain("<h1")
    expect(html).toContain("<h2")
    expect(html).toContain("<ul")
    expect(html).toContain("<ol")
    expect(html).toContain("第一条")
    expect(html).toContain("步骤一")
  })

  it("renders blockquotes as separate emphasis blocks", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content={"> 这里是提醒"} />)

    expect(html).toContain("<blockquote")
    expect(html).toContain("这里是提醒")
  })
})
