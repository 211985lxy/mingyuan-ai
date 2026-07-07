import { describe, expect, it } from "vitest"
import {
  normalizeDefamiliarization,
  NOVELTY_HIGH,
  NOVELTY_LOW,
  noveltyLevel,
  SCARCITY_META,
  RHETORIC_META,
} from "@/lib/topic-defamiliarization"

describe("normalizeDefamiliarization", () => {
  it("保留合法的稀缺类型、赋比兴与含金量分，且不生成 advice", () => {
    const result = normalizeDefamiliarization({
      scarcityType: "info",
      rhetoric: "bi",
      noveltyScore: 82,
      note: "财经博主才能拿到的稀缺数据视角",
    })
    expect(result.scarcityType).toBe("info")
    expect(result.rhetoric).toBe("bi")
    expect(result.noveltyScore).toBe(82)
    expect(result.note).toBe("财经博主才能拿到的稀缺数据视角")
    expect(result.advice).toBeUndefined()
  })

  it("noveltyScore 超出范围会被 clamp 到 0-100", () => {
    expect(normalizeDefamiliarization({ scarcityType: "curio", rhetoric: "fu", noveltyScore: 150 }).noveltyScore).toBe(100)
    expect(normalizeDefamiliarization({ scarcityType: "curio", rhetoric: "fu", noveltyScore: -5 }).noveltyScore).toBe(0)
  })

  it("非法 scarcityType / rhetoric 会被置空并给出 advice", () => {
    const result = normalizeDefamiliarization({
      scarcityType: "unknown" as never,
      rhetoric: "nope" as never,
      noveltyScore: 80,
    })
    expect(result.scarcityType).toBeUndefined()
    expect(result.rhetoric).toBeUndefined()
    expect(result.advice).toContain("稀缺类型")
  })

  it("缺赋比兴时给出赋比兴建议", () => {
    const result = normalizeDefamiliarization({ scarcityType: "event", noveltyScore: 70 })
    expect(result.scarcityType).toBe("event")
    expect(result.rhetoric).toBeUndefined()
    expect(result.advice).toContain("赋比兴")
  })

  it("含金量低于阈值时给出偏低建议", () => {
    const result = normalizeDefamiliarization({ scarcityType: "scenery", rhetoric: "xing", noveltyScore: 55 })
    expect(result.advice).toContain("含金量偏低")
  })

  it("空输入给出缺稀缺类型的 advice", () => {
    const result = normalizeDefamiliarization(undefined)
    expect(result.scarcityType).toBeUndefined()
    expect(result.rhetoric).toBeUndefined()
    expect(result.noveltyScore).toBeUndefined()
    expect(result.advice).toContain("稀缺类型")
  })

  it("note 空字符串会被清除", () => {
    const result = normalizeDefamiliarization({ scarcityType: "beauty", rhetoric: "fu", noveltyScore: 80, note: "   " })
    expect(result.note).toBeUndefined()
  })
})

describe("noveltyLevel 阈值边界", () => {
  it(NOVELTY_LOW + " 为 low/mid 分界", () => {
    expect(noveltyLevel(NOVELTY_LOW - 1)).toBe("low")
    expect(noveltyLevel(NOVELTY_LOW)).toBe("mid")
  })
  it(NOVELTY_HIGH + " 为 mid/high 分界", () => {
    expect(noveltyLevel(NOVELTY_HIGH - 1)).toBe("mid")
    expect(noveltyLevel(NOVELTY_HIGH)).toBe("high")
  })
})

describe("META 查表", () => {
  it("稀缺类型 6 项与赋比兴 3 项均有中文名", () => {
    expect(Object.keys(SCARCITY_META)).toHaveLength(6)
    expect(Object.keys(RHETORIC_META)).toHaveLength(3)
    expect(SCARCITY_META.info.name).toBe("稀缺信息资讯")
    expect(RHETORIC_META.xing.name).toBe("兴")
  })
})
