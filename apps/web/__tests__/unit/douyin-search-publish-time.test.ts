import { describe, expect, it } from "vitest"

import { toIsoPublishedAt } from "@/features/opportunities/adapters/douyin-search"

describe("douyin search publishTime normalize", () => {
  it("接受秒级时间戳", () => {
    expect(toIsoPublishedAt(1_700_000_000)).toMatch(/^2023-/)
  })

  it("接受毫秒时间戳", () => {
    expect(toIsoPublishedAt(1_700_000_000_000)).toMatch(/^2023-/)
  })

  it("接受 ISO 字符串", () => {
    expect(toIsoPublishedAt("2024-01-15T08:00:00.000Z")).toBe("2024-01-15T08:00:00.000Z")
  })

  it("坏值返回 undefined，不抛错", () => {
    expect(toIsoPublishedAt("not-a-date")).toBeUndefined()
    expect(toIsoPublishedAt(Number.NaN)).toBeUndefined()
    expect(toIsoPublishedAt(0)).toBeUndefined()
  })
})
