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
})
