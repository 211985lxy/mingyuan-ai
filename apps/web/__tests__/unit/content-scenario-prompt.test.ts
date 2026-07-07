import { describe, expect, it } from "vitest"

import {
  buildScenarioPromptBlock,
  type ContentScenario,
} from "@/lib/content-scenario-config"

const ALL_SCENARIOS: ContentScenario[] = [
  "ip_knowledge",
  "entity_local",
  "traffic_conversion",
  "xhs_planting",
  "kol_explore",
]

const FORBIDDEN_AI_PHRASES = [
  "赋能",
  "闭环",
  "抓手",
  "颗粒度",
  "对齐",
  "拉通",
  "很高兴能与您",
  "这是一个非常好的",
  "作为AI",
  "综上所述",
]

describe("buildScenarioPromptBlock", () => {
  it("returns non-empty blocks for all 5 scenarios (>50 chars, contains 核心任务)", () => {
    for (const scenario of ALL_SCENARIOS) {
      const block = buildScenarioPromptBlock(scenario)
      expect(block).toBeTruthy()
      expect(block.length).toBeGreaterThan(50)
      expect(block).toContain("你的核心任务")
    }
  })

  it("returns empty string when no scenario is provided", () => {
    expect(buildScenarioPromptBlock(undefined)).toBe("")
  })

  it("no scenario prompt contains forbidden AI phrases", () => {
    for (const scenario of ALL_SCENARIOS) {
      const block = buildScenarioPromptBlock(scenario)
      for (const phrase of FORBIDDEN_AI_PHRASES) {
        expect(block, `Scenario "${scenario}" contains forbidden phrase "${phrase}"`).not.toContain(
          phrase,
        )
      }
    }
  })

  it("each scenario block starts with 【...模式】header", () => {
    for (const scenario of ALL_SCENARIOS) {
      const block = buildScenarioPromptBlock(scenario)
      expect(block).toMatch(/^【.+模式】/)
    }
  })
})
