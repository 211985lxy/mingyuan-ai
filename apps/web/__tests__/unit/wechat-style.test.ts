import { describe, expect, it } from "vitest"

import {
  WECHAT_THEMES,
  escapeHtml,
  extractWechatTitle,
  parseWechatBlocks,
  renderWechatArticleHtml,
  renderWechatHtml,
  stripFirstH1Line,
  wechatPlainText,
} from "@/lib/wechat-style"

const THEME = WECHAT_THEMES[0]

describe("escapeHtml", () => {
  it("转义尖括号、引号与 & 符", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'a'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;a&#39;",
    )
  })
})

describe("renderWechatHtml 安全性", () => {
  it("源文本中的 <script> 不会出现在可执行位置（已转义）", () => {
    const html = renderWechatHtml(`# 标题\n正文 <script>alert(1)</script> 结束`, THEME)
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("输出 100% 内联样式：不出现 class 属性", () => {
    const source = [
      "# 标题",
      "",
      "正文 **加粗** 一下",
      "",
      "> 引用一句",
      "",
      "- 第一项",
      "- 第二项",
      "",
      "1. 第一步",
      "2. 第二步",
      "",
      "---",
    ].join("\n")
    const html = renderWechatHtml(source, THEME)
    expect(html).not.toContain("class=")
    // 完整文章（含标题）同样不允许出现 class
    expect(renderWechatArticleHtml("标题", source, THEME)).not.toContain("class=")
  })
})

describe("renderWechatHtml 语法渲染", () => {
  it("输出以 <section style= 根容器包裹", () => {
    const html = renderWechatHtml("正文", THEME)
    expect(html.startsWith(`<section style="`)).toBe(true)
    expect(html.endsWith("</section>")).toBe(true)
  })

  it("# / ## / ### 渲染为 h1 / h2 / h3", () => {
    const html = renderWechatHtml("# 一级\n## 二级\n### 三级", THEME)
    expect(html).toContain("<h1")
    expect(html).toContain("<h2")
    expect(html).toContain("<h3")
    expect(html).toContain("一级")
    expect(html).toContain("二级")
    expect(html).toContain("三级")
  })

  it("> 渲染为带左边框与底色的引用块，连续引用合并", () => {
    const html = renderWechatHtml("> 第一句\n> 第二句", THEME)
    expect(html).toContain("<blockquote")
    expect(html).toContain(`border-left:3px solid ${THEME.accentColor}`)
    expect(html.match(/<blockquote/g)).toHaveLength(1)
  })

  it("- 渲染为无序列表，连续项合并为一个 ul", () => {
    const html = renderWechatHtml("- 苹果\n- 香蕉", THEME)
    expect(html).toContain("<ul")
    expect(html.match(/<ul/g)).toHaveLength(1)
    expect(html.match(/<li/g)).toHaveLength(2)
  })

  it("1. 渲染为有序列表", () => {
    const html = renderWechatHtml("1. 先这样\n2. 再这样", THEME)
    expect(html).toContain("<ol")
    expect(html.match(/<li/g)).toHaveLength(2)
  })

  it("**粗体** 渲染为带强调色的 strong", () => {
    const html = renderWechatHtml("这里有 **重点** 内容", THEME)
    expect(html).toContain(`<strong style="color:${THEME.accentColor};font-weight:600;">重点</strong>`)
  })

  it("--- 渲染为分割线（border-top）", () => {
    const html = renderWechatHtml("上文\n\n---\n\n下文", THEME)
    expect(html).toContain("border-top:1px solid")
  })

  it("空行分段：两段文字各成一个 p", () => {
    const html = renderWechatHtml("第一段\n\n第二段", THEME)
    expect(html.match(/<p /g)).toHaveLength(2)
  })

  it("空输入不炸：仍返回根容器", () => {
    expect(() => renderWechatHtml("", THEME)).not.toThrow()
    expect(renderWechatHtml("", THEME)).toContain("<section")
  })
})

describe("主题差异", () => {
  it("WECHAT_THEMES 至少 4 套，字号/行高在公众号常用区间", () => {
    expect(WECHAT_THEMES.length).toBeGreaterThanOrEqual(4)
    for (const theme of WECHAT_THEMES) {
      expect(theme.fontSize).toBeGreaterThanOrEqual(15)
      expect(theme.fontSize).toBeLessThanOrEqual(16)
      expect(theme.lineHeight).toBeGreaterThanOrEqual(1.75)
      expect(theme.lineHeight).toBeLessThanOrEqual(2)
    }
  })

  it("不同主题输出样式不同", () => {
    const a = renderWechatHtml("正文 **重点**", WECHAT_THEMES[0])
    const b = renderWechatHtml("正文 **重点**", WECHAT_THEMES[1])
    expect(a).not.toBe(b)
  })
})

describe("标题与纯文本辅助函数", () => {
  it("extractWechatTitle 取第一个 # 标题并去掉粗体标记", () => {
    expect(extractWechatTitle("前言\n# 我的 **标题**\n正文")).toBe("我的 标题")
    expect(extractWechatTitle("## 只有二级\n正文")).toBeNull()
  })

  it("stripFirstH1Line 只删第一处一级标题行", () => {
    expect(stripFirstH1Line("# 标题\n正文\n# 又一个")).toBe("正文\n# 又一个")
    expect(stripFirstH1Line("没有标题")).toBe("没有标题")
  })

  it("wechatPlainText 去掉全部轻量标记", () => {
    const plain = wechatPlainText("# 标题\n> 引用\n- 列表\n1. 有序\n**加粗**\n---")
    expect(plain).toBe("标题\n引用\n列表\n有序\n加粗")
  })
})

describe("parseWechatBlocks", () => {
  it("连续同类行合并、不同类分行", () => {
    const blocks = parseWechatBlocks("# 标题\n正文一\n正文二\n- 甲\n- 乙\n> 引用")
    expect(blocks.map((b) => b.kind)).toEqual(["h1", "text", "ul", "quote"])
    expect(blocks[1].lines).toHaveLength(2)
    expect(blocks[2].lines).toHaveLength(2)
  })
})
