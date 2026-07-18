import { describe, expect, it } from "vitest"
import { markdownToWechatHtml } from "@/lib/wechat-style"
import { parseImageTextDoc, serializeImageTextDoc } from "@/lib/image-text-doc"
import { buildLocalChecklist } from "@/lib/xhs-review"

describe("editor safety primitives", () => {
  it("escapes user HTML and emits inline-only WeChat markup", () => {
    const html = markdownToWechatHtml("# 标题\n\n<script>alert(1)</script> **正文**")
    expect(html).not.toContain("<script")
    expect(html).not.toContain("class=")
    expect(html).toContain("&lt;script&gt;")
  })

  it("round-trips structured image-text pages", () => {
    const parsed = parseImageTextDoc("说明\n\n第 1 页：封面\n正文\n配图：画面")
    expect(parsed.pages[0].note).toBe("画面")
    expect(parseImageTextDoc(serializeImageTextDoc(parsed.header, parsed.pages)).pages).toEqual(parsed.pages)
  })

  it("keeps deterministic XHS checks local", () => {
    expect(buildLocalChecklist("一个标题", "这是正文")).toHaveLength(4)
    expect(buildLocalChecklist("超长标题超长标题超长标题超长标题超长标题超长标题", "第一\n第二\n第三\n第四\n第五\n第六")[2].status).toBe("warn")
  })
})
