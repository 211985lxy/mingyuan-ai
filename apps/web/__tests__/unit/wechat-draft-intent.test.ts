import { describe, expect, it } from "vitest"
import { hasWechatDraftIntent } from "@/lib/aim-current-user-input"

describe("wechat draft intent detection", () => {
  it("detects '推到草稿箱'", () => {
    expect(hasWechatDraftIntent("帮我把这篇文章推到草稿箱")).toBe(true)
  })

  it("detects '推到公众号草稿箱'", () => {
    expect(hasWechatDraftIntent("推到公众号草稿箱")).toBe(true)
  })

  it("detects '保存到草稿箱'", () => {
    expect(hasWechatDraftIntent("保存到草稿箱")).toBe(true)
  })

  it("detects '发布到公众号'", () => {
    expect(hasWechatDraftIntent("发布到公众号")).toBe(true)
  })

  it("detects '推到公众号'", () => {
    expect(hasWechatDraftIntent("推到公众号")).toBe(true)
  })

  it("does not trigger on normal chat", () => {
    expect(hasWechatDraftIntent("帮我写一篇关于 AI 的文章")).toBe(false)
    expect(hasWechatDraftIntent("这篇草稿怎么改")).toBe(false)
    expect(hasWechatDraftIntent("草稿箱里有什么")).toBe(false)
  })

  it("handles whitespace normalization", () => {
    expect(hasWechatDraftIntent("帮 我 推 到 草稿箱")).toBe(true)
    expect(hasWechatDraftIntent("\n推到公众号\n")).toBe(true)
  })
})
