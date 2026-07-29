import { describe, it, expect } from "vitest"
import { sanitizeOutcomeBody, buildOutcomeUpdate } from "@/lib/content-outcome"

describe("sanitizeOutcomeBody", () => {
  it("未填写字段为 null，不转为 0", () => {
    const out = sanitizeOutcomeBody({ collectWindowDay: 7, dmCount: 3 })
    expect(out.dmCount).toBe(3)
    expect(out.qualifiedLeadCount).toBeNull()
    expect(out.views).toBeNull()
  })
  it("空字符串/undefined -> null（绝不当 0）", () => {
    const out = sanitizeOutcomeBody({ collectWindowDay: 7, views: "", revenue: undefined })
    expect(out.views).toBeNull()
    expect(out.revenue).toBeNull()
  })
  it("非法 collectWindowDay 拒绝", () => {
    expect(() => sanitizeOutcomeBody({ collectWindowDay: 5 })).toThrow()
    expect(() => sanitizeOutcomeBody({ collectWindowDay: "7" as any })).toThrow()
  })
  it("显式 0 保留为 0（用户确实填了 0）", () => {
    expect(sanitizeOutcomeBody({ collectWindowDay: 7, dmCount: 0 }).dmCount).toBe(0)
  })
  it("新版备注与历史 userVerdict 分列保存", () => {
    const out = sanitizeOutcomeBody({
      collectWindowDay: 7,
      verdictCode: "neutral",
      verdictNote: "数据一般",
    })
    expect(out.verdictNote).toBe("数据一般")
    expect(out.userVerdict).toBeNull()
    expect(out.verdictCode).toBe("neutral")
  })
})

describe("buildOutcomeUpdate (PATCH 语义)", () => {
  it("只包含请求体里出现过的字段，未出现的字段不在 update 里（保留旧值）", () => {
    // 场景：第一次已存 dmCount=3；第二次请求体只带 {collectWindowDay, views}
    const sanitized = sanitizeOutcomeBody({ collectWindowDay: 7, views: 500 })
    const update = buildOutcomeUpdate(sanitized, new Set(["collectWindowDay", "views"]))
    expect(update).toHaveProperty("collectWindowDay", 7)
    expect(update).toHaveProperty("views", 500) // 第二次带了 views，应更新
    expect(update).not.toHaveProperty("dmCount") // 关键：dmCount 没在第二次请求里，不应被覆盖
    expect(update).not.toHaveProperty("qualifiedLeadCount")
  })
  it("显式出现的字段（含 null）会被更新", () => {
    const sanitized = sanitizeOutcomeBody({ collectWindowDay: 14, views: 500, dmCount: 3 })
    const update = buildOutcomeUpdate(sanitized, new Set(["collectWindowDay", "views", "dmCount"]))
    expect(update).toHaveProperty("views", 500)
    expect(update).toHaveProperty("dmCount", 3)
  })
  it("把已填字段显式清空（传 null/空串）应被更新为 null", () => {
    const sanitized = sanitizeOutcomeBody({ collectWindowDay: 7, views: "" })
    const update = buildOutcomeUpdate(sanitized, new Set(["collectWindowDay", "views"]))
    expect(update).toHaveProperty("views", null)
  })
  it("旧客户端 userVerdict 同步到 verdictNote，但不修改 verdictCode", () => {
    const sanitized = sanitizeOutcomeBody({ collectWindowDay: 7, userVerdict: "旧备注" })
    const update = buildOutcomeUpdate(
      sanitized,
      new Set(["collectWindowDay", "userVerdict"]),
    )
    expect(update).toHaveProperty("userVerdict", "旧备注")
    expect(update).toHaveProperty("verdictNote", "旧备注")
    expect(update).not.toHaveProperty("verdictCode")
  })
})
