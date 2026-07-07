import { describe, expect, it } from "vitest"
import {
  BATCH_INPUT_THRESHOLD,
  shouldSuggestBatch,
  getBatchSuggestion,
} from "@/lib/batch-input-utils"

describe("batch-input-utils", () => {
  it("BATCH_INPUT_THRESHOLD > 0", () => {
    expect(BATCH_INPUT_THRESHOLD).toBeGreaterThan(0)
  })

  it("long text (> threshold) → shouldSuggestBatch = true", () => {
    const longText = "a".repeat(BATCH_INPUT_THRESHOLD + 1)
    expect(shouldSuggestBatch(longText)).toBe(true)
  })

  it("short text → shouldSuggestBatch = false", () => {
    expect(shouldSuggestBatch("短文本")).toBe(false)
  })

  it("text at exactly threshold → shouldSuggestBatch = false", () => {
    const exactText = "a".repeat(BATCH_INPUT_THRESHOLD)
    expect(shouldSuggestBatch(exactText)).toBe(false)
  })

  it("getBatchSuggestion for long text has shouldSuggest=true, charCount correct, message contains '字'", () => {
    const longText = "a".repeat(BATCH_INPUT_THRESHOLD + 1)
    const result = getBatchSuggestion(longText)

    expect(result.shouldSuggest).toBe(true)
    expect(result.charCount).toBe(longText.length)
    expect(result.message).toContain("字")
    expect(result.message.length).toBeGreaterThan(0)
  })

  it("getBatchSuggestion for short text has shouldSuggest=false, message=''", () => {
    const result = getBatchSuggestion("短文本")

    expect(result.shouldSuggest).toBe(false)
    expect(result.charCount).toBe("短文本".length)
    expect(result.message).toBe("")
  })
})
