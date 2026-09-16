import { describe, expect, it } from "vitest"

import { buildQuarantineReviewNote } from "../../scripts/backfill-published-aweme-ids"

const PREFIX = "[SSRF 存量隔离]"

describe("buildQuarantineReviewNote（F18 动作 D3 留痕）", () => {
  it("原备注为空时只写隔离标记 + 时间戳 + 原因", () => {
    const at = new Date("2026-09-16T10:00:00Z")
    const note = buildQuarantineReviewNote(null, "解析到非公网地址", at)
    expect(note.startsWith(PREFIX)).toBe(true)
    expect(note).toContain("2026-09-16T10:00:00.000Z")
    expect(note).toContain("解析到非公网地址")
  })

  it("原备注存在时保留原文并追加，不覆盖历史留痕（可重跑幂等的前提）", () => {
    const note = buildQuarantineReviewNote("原有人工备注", "复核失败", new Date("2026-09-16T10:00:00Z"))
    expect(note.startsWith("原有人工备注\n")).toBe(true)
    expect(note).toContain(PREFIX)
  })

  it("空白原备注按空处理", () => {
    const note = buildQuarantineReviewNote("   \n  ", "x")
    expect(note.startsWith(PREFIX)).toBe(true)
  })
})
