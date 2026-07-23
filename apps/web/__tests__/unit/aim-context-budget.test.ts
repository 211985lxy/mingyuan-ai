import { describe, expect, it } from "vitest"

import {
  AIM_CONTEXT_BUDGET_PROFILES,
  applyAimContextBudget,
  type AimContextBlocks,
} from "@/lib/aim-context-budget"

function blocks(size: number): AimContextBlocks {
  return {
    conversationBlock: "C".repeat(size),
    knowledgeBlock: "K".repeat(size),
    methodologyBlock: "M".repeat(size),
    businessDiagnosisBlock: "B".repeat(size),
    viralStructureBlock: "V".repeat(size),
    eventStorytellingBlock: "E".repeat(size),
    ipWikiBlock: "I".repeat(size),
    selectedMethodologyBlock: "S".repeat(size),
  }
}

describe("AIM context budget", () => {
  it("keeps the combined runtime context within the task budget", () => {
    const result = applyAimContextBudget(blocks(10_000), "new_copy")
    const included = Object.values(result.blocks).reduce((sum, value) => sum + value.length, 0)

    expect(included).toBeLessThanOrEqual(AIM_CONTEXT_BUDGET_PROFILES.new_copy.totalChars)
    expect(result.stats.truncatedBlocks.length).toBeGreaterThan(0)
    expect(result.stats.includedChars).toBe(included)
  })

  it("gives light edits a smaller context budget than new copy", () => {
    const input = blocks(10_000)
    const light = applyAimContextBudget(input, "light_edit")
    const fresh = applyAimContextBudget(input, "new_copy")

    expect(light.stats.includedChars).toBeLessThan(fresh.stats.includedChars)
  })

  it("prioritizes conversation and IP Wiki before methodology for positioning", () => {
    const result = applyAimContextBudget(blocks(10_000), "positioning_topic")

    expect(result.blocks.conversationBlock.length).toBeGreaterThan(0)
    expect(result.blocks.ipWikiBlock.length).toBeGreaterThan(0)
    expect(result.blocks.methodologyBlock.length).toBeLessThan(10_000)
  })

  it("does not mutate the input blocks", () => {
    const input = blocks(10_000)
    const original = { ...input }

    applyAimContextBudget(input, "quality_review")

    expect(input).toEqual(original)
  })
})
