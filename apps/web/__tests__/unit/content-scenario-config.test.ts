import { describe, expect, it } from "vitest"

import {
  buildScenarioPromptBlock,
  getScenarioConfig,
  SCENARIO_CONFIGS,
  SCENARIO_LABELS,
  type ContentScenario,
} from "@/lib/content-scenario-config"

const ALL_SCENARIOS: ContentScenario[] = [
  "ip_knowledge",
  "entity_local",
  "traffic_conversion",
  "xhs_planting",
  "kol_explore",
]

const FORBIDDEN_PHRASES = ["赋能", "闭环", "抓手", "颗粒度", "对齐", "拉通"]

describe("content-scenario-config", () => {
  it("exports exactly 5 scenarios", () => {
    expect(ALL_SCENARIOS).toHaveLength(5)
    // Ensure each scenario key exists in SCENARIO_LABELS and SCENARIO_CONFIGS
    for (const s of ALL_SCENARIOS) {
      expect(SCENARIO_LABELS[s]).toBeDefined()
      expect(SCENARIO_CONFIGS[s]).toBeDefined()
    }
  })

  it("each scenario has a complete config with all required fields", () => {
    for (const s of ALL_SCENARIOS) {
      const config = getScenarioConfig(s)
      expect(config).toBeDefined()

      expect(config.promptBlock).toBeTruthy()
      expect(typeof config.promptBlock).toBe("string")
      expect(config.promptBlock.length).toBeGreaterThan(50)

      expect(config.knowledgeStrategy).toBeTruthy()
      expect(typeof config.knowledgeStrategy).toBe("string")

      expect(config.qualityFocus).toBeTruthy()
      expect(typeof config.qualityFocus).toBe("string")
    }
  })

  it("SCENARIO_LABELS maps each scenario to a Chinese label", () => {
    for (const s of ALL_SCENARIOS) {
      const label = SCENARIO_LABELS[s]
      expect(label).toBeTruthy()
      // Should contain Chinese characters
      expect(/[\u4e00-\u9fff]/.test(label)).toBe(true)
    }
  })

  it("traffic_conversion prompt contains 3秒 and CTA", () => {
    const block = buildScenarioPromptBlock("traffic_conversion")
    expect(block).toContain("3秒")
    expect(block).toContain("CTA")
  })

  it("kol_explore prompt contains 感官爆点", () => {
    const block = buildScenarioPromptBlock("kol_explore")
    expect(block).toContain("感官爆点")
  })

  it("buildScenarioPromptBlock returns empty string for undefined", () => {
    expect(buildScenarioPromptBlock(undefined)).toBe("")
  })

  it("no scenario prompt contains forbidden AI jargon", () => {
    for (const s of ALL_SCENARIOS) {
      const config = getScenarioConfig(s)
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(config.promptBlock).not.toContain(phrase)
      }
    }
  })
})
