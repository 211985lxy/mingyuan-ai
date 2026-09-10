import { describe, expect, it } from "vitest"

import { nextShanghaiDateText, parseShanghaiDateRange, shanghaiDateText } from "@/lib/shanghai-time"

describe("Shanghai date ranges", () => {
  it("uses Shanghai calendar dates and a half-open UTC interval", () => {
    const result = parseShanghaiDateRange(
      new URLSearchParams({ from: "2026-09-01", to: "2026-09-07" }),
    )
    expect("error" in result).toBe(false)
    if ("error" in result) return
    expect(result.start.toISOString()).toBe("2026-08-31T16:00:00.000Z")
    expect(result.end.toISOString()).toBe("2026-09-07T16:00:00.000Z")
  })

  it("defaults to the latest seven Shanghai calendar days", () => {
    const result = parseShanghaiDateRange(
      new URLSearchParams(),
      new Date("2026-09-10T15:00:00.000Z"),
    )
    expect(result).toEqual(expect.objectContaining({ from: "2026-09-04", to: "2026-09-10" }))
  })

  it("rejects invalid and overlong ranges", () => {
    expect(parseShanghaiDateRange(new URLSearchParams({ from: "2026-02-30", to: "2026-03-01" }))).toEqual({ error: "日期必须是有效的 YYYY-MM-DD" })
    expect(parseShanghaiDateRange(new URLSearchParams({ from: "2026-01-01", to: "2026-02-01" }))).toEqual({ error: "查询周期不得超过 31 天" })
  })

  it("formats and advances Shanghai dates", () => {
    expect(shanghaiDateText(new Date("2026-09-09T16:00:00.000Z"))).toBe("2026-09-10")
    expect(nextShanghaiDateText("2026-09-10")).toBe("2026-09-11")
  })
})
