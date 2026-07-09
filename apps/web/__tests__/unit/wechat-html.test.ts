import { describe, expect, it } from "vitest"
import { minimalMarkdownToHtml, sanitizeWechatHtml } from "@/lib/wechat-html-convert"

describe("wechat html — minimal markdown converter", () => {
  it("converts paragraphs", () => {
    const md = "第一段\n\n第二段"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<p>第一段</p>")
    expect(html).toContain("<p>第二段</p>")
  })

  it("converts headings h1-h3", () => {
    const md = "# 一级标题\n## 二级标题\n### 三级标题"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<h1>一级标题</h1>")
    expect(html).toContain("<h2>二级标题</h2>")
    expect(html).toContain("<h3>三级标题</h3>")
  })

  it("converts blockquotes", () => {
    const md = "> 引用内容"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<blockquote>")
    expect(html).toContain("<p>引用内容</p>")
    expect(html).toContain("</blockquote>")
  })

  it("converts unordered lists", () => {
    const md = "- 项目一\n- 项目二\n- 项目三"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>项目一</li>")
    expect(html).toContain("<li>项目二</li>")
    expect(html).toContain("<li>项目三</li>")
    expect(html).toContain("</ul>")
  })

  it("converts ordered lists", () => {
    const md = "1. 第一\n2. 第二\n3. 第三"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<ol>")
    expect(html).toContain("<li>第一</li>")
    expect(html).toContain("</ol>")
  })

  it("converts bold text", () => {
    const md = "这是**加粗**文字"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<strong>加粗</strong>")
  })

  it("converts italic text", () => {
    const md = "这是*斜体*文字"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<em>斜体</em>")
  })

  it("converts 【配图：描述】 to image placeholder", () => {
    const md = "正文内容\n\n【配图：工具界面截图】\n\n继续正文"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain('<img src="" alt="工具界面截图" data-placeholder="true"/>')
  })

  it("converts standard markdown images to placeholder", () => {
    const md = "![产品截图](https://example.com/img.png)"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain('<img src="" alt="产品截图" data-placeholder="true"/>')
    // URL should NOT appear in output (only placeholder)
    expect(html).not.toContain("example.com")
  })

  it("converts links to plain text (WeChat strips external links)", () => {
    const md = "查看[文档链接](https://docs.example.com)了解更多"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("文档链接")
    expect(html).not.toContain("href")
    expect(html).not.toContain("example.com")
  })

  it("converts hr", () => {
    const md = "上面\n\n---\n\n下面"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<hr/>")
  })

  it("escapes HTML in content to prevent XSS", () => {
    const md = "<script>alert('xss')</script>"
    const html = minimalMarkdownToHtml(md)
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("handles empty content", () => {
    const html = minimalMarkdownToHtml("")
    expect(html).toBe("")
  })

  it("handles mixed content with various elements", () => {
    const md = "# 标题\n\n开头段落\n\n> 引用\n\n- 列表项\n\n**加粗**和*斜体*\n\n【配图：封面】"
    const html = minimalMarkdownToHtml(md)
    expect(html).toContain("<h1>标题</h1>")
    expect(html).toContain("<blockquote>")
    expect(html).toContain("<ul>")
    expect(html).toContain("<strong>加粗</strong>")
    expect(html).toContain("<em>斜体</em>")
    expect(html).toContain("data-placeholder")
  })
})

describe("wechat html — sanitizeHtml", () => {
  it("allows whitelisted tags", () => {
    const html = "<p>段落</p><strong>加粗</strong><h2>标题</h2>"
    const result = sanitizeWechatHtml(html)
    expect(result).toContain("<p>段落</p>")
    expect(result).toContain("<strong>加粗</strong>")
    expect(result).toContain("<h2>标题</h2>")
  })

  it("strips dangerous tags like script and iframe", () => {
    const html = "<p>安全</p><script>alert(1)</script><iframe src='evil'></iframe>"
    const result = sanitizeWechatHtml(html)
    expect(result).toContain("<p>安全</p>")
    expect(result).not.toContain("<script")
    expect(result).not.toContain("<iframe")
  })
})
