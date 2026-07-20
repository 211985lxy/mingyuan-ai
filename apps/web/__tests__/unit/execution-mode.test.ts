import { describe, expect, it } from "vitest"
import {
  EXECUTION_MODES,
  isExecutionMode,
  isCaptureOnly,
  isGenerationSuppressed,
  isReplySuppressed,
  resolveExecutionMode,
} from "@/lib/execution-mode"
import type { ExecutionMode } from "@/lib/execution-mode"

describe("EXECUTION_MODES", () => {
  it("contains exactly three modes", () => {
    expect(EXECUTION_MODES).toEqual(["capture_only", "evaluate", "live"])
  })
})

describe("isExecutionMode", () => {
  it("accepts valid modes", () => {
    expect(isExecutionMode("capture_only")).toBe(true)
    expect(isExecutionMode("evaluate")).toBe(true)
    expect(isExecutionMode("live")).toBe(true)
  })

  it("rejects invalid values", () => {
    expect(isExecutionMode("")).toBe(false)
    expect(isExecutionMode("shadow")).toBe(false)
    expect(isExecutionMode("LIVE")).toBe(false)
    expect(isExecutionMode(null)).toBe(false)
    expect(isExecutionMode(undefined)).toBe(false)
  })
})

describe("resolveExecutionMode", () => {
  it("returns binding mode when no override is set", () => {
    expect(resolveExecutionMode("live")).toBe("live")
    expect(resolveExecutionMode("evaluate")).toBe("evaluate")
    expect(resolveExecutionMode("capture_only")).toBe("capture_only")
  })

  it("returns binding mode when override is an invalid string", () => {
    expect(resolveExecutionMode("live", "invalid")).toBe("live")
    expect(resolveExecutionMode("live", "")).toBe("live")
  })

  it("allows demotion via override", () => {
    // live → evaluate (demotion, allowed)
    expect(resolveExecutionMode("live", "evaluate")).toBe("evaluate")
    // live → capture_only (demotion, allowed)
    expect(resolveExecutionMode("live", "capture_only")).toBe("capture_only")
    // evaluate → capture_only (demotion, allowed)
    expect(resolveExecutionMode("evaluate", "capture_only")).toBe("capture_only")
  })

  it("blocks promotion via override (key safety guarantee)", () => {
    // capture_only → evaluate (promotion, blocked)
    expect(resolveExecutionMode("capture_only", "evaluate")).toBe("capture_only")
    // capture_only → live (promotion, blocked)
    expect(resolveExecutionMode("capture_only", "live")).toBe("capture_only")
    // evaluate → live (promotion, blocked)
    expect(resolveExecutionMode("evaluate", "live")).toBe("evaluate")
  })

  it("allows same-level override (no-op)", () => {
    expect(resolveExecutionMode("live", "live")).toBe("live")
    expect(resolveExecutionMode("evaluate", "evaluate")).toBe("evaluate")
    expect(resolveExecutionMode("capture_only", "capture_only")).toBe("capture_only")
  })

  it("handles undefined/null override gracefully", () => {
    expect(resolveExecutionMode("live", undefined)).toBe("live")
    expect(resolveExecutionMode("live", null as unknown as string)).toBe("live")
  })
})

describe("isReplySuppressed", () => {
  it("suppresses replies for capture_only and evaluate", () => {
    expect(isReplySuppressed("capture_only")).toBe(true)
    expect(isReplySuppressed("evaluate")).toBe(true)
  })

  it("does not suppress replies for live", () => {
    expect(isReplySuppressed("live")).toBe(false)
  })

  it("does not suppress for null/undefined (backward compat)", () => {
    expect(isReplySuppressed(null)).toBe(false)
    expect(isReplySuppressed(undefined)).toBe(false)
  })
})

describe("isGenerationSuppressed", () => {
  it("suppresses generation for capture_only and evaluate", () => {
    expect(isGenerationSuppressed("capture_only")).toBe(true)
    expect(isGenerationSuppressed("evaluate")).toBe(true)
  })

  it("does not suppress for live", () => {
    expect(isGenerationSuppressed("live")).toBe(false)
  })

  it("does not suppress for null/undefined", () => {
    expect(isGenerationSuppressed(null)).toBe(false)
    expect(isGenerationSuppressed(undefined)).toBe(false)
  })
})

describe("isCaptureOnly", () => {
  it("is true only for capture_only", () => {
    expect(isCaptureOnly("capture_only")).toBe(true)
    expect(isCaptureOnly("evaluate")).toBe(false)
    expect(isCaptureOnly("live")).toBe(false)
    expect(isCaptureOnly(null)).toBe(false)
  })
})
