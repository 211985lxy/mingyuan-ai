import { describe, expect, it } from "vitest"

import { hasAimFormatMarker, stripAimFormatMarkers } from "@/lib/aim/format-marker-cleanup"

describe("stripAimFormatMarkers", () => {
  it("清除正文末尾独立的 ===END FORMAT=== 尾标（演示实测泄漏的形态）", () => {
    const raw = "这是正文第一段。\n\n这是正文第二段。\n\n===END FORMAT==="
    expect(stripAimFormatMarkers(raw)).toBe("这是正文第一段。\n\n这是正文第二段。")
  })

  it("清除带空格与大小写变体（=== END FORMAT === / ===end format===）", () => {
    expect(stripAimFormatMarkers("正文内容\n=== END FORMAT ===")).toBe("正文内容")
    expect(stripAimFormatMarkers("正文内容\n===END FORMAT ===")).toBe("正文内容")
    expect(stripAimFormatMarkers("正文内容\n===end format===")).toBe("正文内容")
  })

  it("清除 ===END=== 这种简写收尾标记", () => {
    expect(stripAimFormatMarkers("正文内容\n===END===")).toBe("正文内容")
    expect(stripAimFormatMarkers("正文内容\n=== END ===")).toBe("正文内容")
  })

  it("不误删正文里夹带的半句话或行内 ===（只清独占整行的标记）", () => {
    // 行内的 === 不能被当标记删除
    const inline = "请注意 a === b 这个判断，不要改。"
    expect(stripAimFormatMarkers(inline)).toBe(inline)
    // 正文里提到「END FORMAT」作为一句话的一部分，不独占整行，不删
    const sentence = "这一段提到 END FORMAT 这个词，但它是正文。"
    expect(stripAimFormatMarkers(sentence)).toBe(sentence)
  })

  it("对干净成稿幂等，不改任何内容", () => {
    const clean = "这是干净正文，没有任何标记。\n\n第二段。"
    expect(stripAimFormatMarkers(clean)).toBe(clean)
  })

  it("删除整行标记后收敛多余空行（最多保留一个空行间隔）", () => {
    const raw = "第一段。\n\n\n===END FORMAT===\n\n\n第二段。"
    expect(stripAimFormatMarkers(raw)).toBe("第一段。\n\n第二段。")
  })

  it("多段正文中间混入标记也能清掉，且正文顺序不变", () => {
    const raw = "段落一。\n===END FORMAT===\n段落二。\n===END FORMAT===\n段落三。"
    expect(stripAimFormatMarkers(raw)).toBe("段落一。\n\n段落二。\n\n段落三。")
  })

  it("空串与空白安全返回（不抛错）", () => {
    expect(stripAimFormatMarkers("")).toBe("")
    expect(stripAimFormatMarkers("   \n\n  ").trim()).toBe("")
  })
})

describe("hasAimFormatMarker", () => {
  it("含独立尾标返回 true", () => {
    expect(hasAimFormatMarker("正文\n===END FORMAT===")).toBe(true)
  })
  it("干净正文返回 false", () => {
    expect(hasAimFormatMarker("干净正文，无标记。")).toBe(false)
  })
  it("仅行内出现不算（行内不算独立标记）", () => {
    expect(hasAimFormatMarker("a === b 是判断")).toBe(false)
  })
})
