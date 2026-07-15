import { describe, expect, it } from "vitest"
import {
  hasConflict,
  pickStrategy,
  sampleWithHistory,
} from "@/lib/topic-element-logic"

describe("topic element derivation", () => {
  it("cycles derivation strategies after the initial refreshes", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(pickStrategy)).toEqual([
      "fresh",
      "fresh",
      "adjacent",
      "niche",
      "remix",
      "adjacent",
      "niche",
      "fresh",
    ])
  })

  it("reuses the latest set for niche exploration", () => {
    expect(sampleWithHistory(
      ["cost", "practical", "story"],
      [["cost", "practical"], ["story", "trust"]],
      "niche",
    )).toEqual(["cost", "practical"])
  })

  it("keeps sampled fresh combinations conflict-free", () => {
    const result = sampleWithHistory(
      ["cost", "authority", "practical", "story", "novelty"],
      [["cost", "practical"]],
      "fresh",
    )
    expect(result.length).toBeGreaterThanOrEqual(2)
    for (let index = 0; index < result.length; index++) {
      for (let other = index + 1; other < result.length; other++) {
        expect(hasConflict(result[index], result[other])).toBe(false)
      }
    }
  })
})
