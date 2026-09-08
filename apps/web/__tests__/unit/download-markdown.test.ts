import { describe, expect, it } from "vitest"

import { buildMarkdownFilename } from "@/lib/aim/download-markdown"

describe("buildMarkdownFilename", () => {
  it("用标题生成安全的 .md 文件名", () => {
    expect(buildMarkdownFilename("中汝达 口播/初稿")).toMatch(/^中汝达-口播-初稿-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it("无标题时回退默认名", () => {
    expect(buildMarkdownFilename()).toMatch(/^aim-content-\d{4}-\d{2}-\d{2}\.md$/)
    expect(buildMarkdownFilename("   ")).toMatch(/^aim-content-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it("超长标题截断到 40 字", () => {
    const name = buildMarkdownFilename("长".repeat(80))
    expect(name.length).toBeLessThanOrEqual(40 + 11 + 3)
  })

  it("截断边界落在分隔符上时，不再残留尾部连字符", () => {
    // 第 40 位恰好是 "/"，替换后截断会留下尾部 "-"；修复后应再次清理。
    const name = buildMarkdownFilename(`${"创".repeat(39)}/追加内容`)
    expect(name).toMatch(/^创{39}-\d{4}-\d{2}-\d{2}\.md$/)
    expect(name).not.toMatch(/-{2}\d{4}/)
    expect(name).not.toMatch(/\.-|-\./)
    expect(name).not.toContain("—")
  })

  it("日期使用本地时区 YYYY-MM-DD（与测试本地计算一致）", () => {
    const now = new Date()
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    expect(buildMarkdownFilename("某标题")).toBe(`某标题-${localDate}.md`)
    expect(buildMarkdownFilename()).toMatch(/^aim-content-\d{4}-\d{2}-\d{2}\.md$/)
  })
})
