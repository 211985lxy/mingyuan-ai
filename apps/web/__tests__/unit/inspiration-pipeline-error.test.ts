import { describe, expect, it } from "vitest"
import {
  InspirationPipelineError,
  asPipelineError,
  formatPipelineUserMessage,
  isPipelineRetryable,
} from "@/lib/inspiration-pipeline-error"

describe("InspirationPipelineError", () => {
  it("carries structured code, category, retryable, and user message", () => {
    const error = new InspirationPipelineError("VIDEO_TOO_LONG")
    expect(error.code).toBe("VIDEO_TOO_LONG")
    expect(error.category).toBe("input")
    expect(error.retryable).toBe(false)
    expect(error.fallbackAllowed).toBe(false)
    expect(error.userMessage).toBe("视频超过10分钟，暂不支持自动收录")
    expect(error.name).toBe("InspirationPipelineError")
  })

  it("preserves the cause when provided", () => {
    const cause = new Error("原始错误")
    const error = new InspirationPipelineError("EXTRACTION_SUBMIT_FAILED", { cause })
    expect(error.cause).toBe(cause)
  })

  it("stores internalDetails separately from userMessage", () => {
    const error = new InspirationPipelineError("PROVIDER_AUTH_FAILED", {
      internalDetails: "API key: sk-xxx (should never reach user)",
    })
    expect(error.userMessage).toBe("文案提取服务配置有问题，请联系管理员。")
    expect(error.internalDetails).toContain("API key")
  })

  it("falls back to UNKNOWN for unrecognized codes", () => {
    const error = new InspirationPipelineError("UNKNOWN")
    expect(error.code).toBe("UNKNOWN")
    expect(error.category).toBe("system")
    expect(error.retryable).toBe(true)
  })
})

describe("asPipelineError", () => {
  it("passes through InspirationPipelineError unchanged", () => {
    const original = new InspirationPipelineError("VIDEO_TOO_LONG")
    const result = asPipelineError(original)
    expect(result).toBe(original)
  })

  it("wraps a plain Error into UNKNOWN", () => {
    const result = asPipelineError(new Error("something broke"))
    expect(result).toBeInstanceOf(InspirationPipelineError)
    expect(result.code).toBe("UNKNOWN")
  })

  it("wraps a string into UNKNOWN", () => {
    const result = asPipelineError("just a string")
    expect(result).toBeInstanceOf(InspirationPipelineError)
    expect(result.code).toBe("UNKNOWN")
  })

  it("wraps with a custom default code", () => {
    const result = asPipelineError(new Error("timeout"), "EXTRACTION_SUBMIT_FAILED")
    expect(result.code).toBe("EXTRACTION_SUBMIT_FAILED")
  })
})

describe("formatPipelineUserMessage", () => {
  it("returns userMessage from InspirationPipelineError", () => {
    const error = new InspirationPipelineError("MULTIPLE_VIDEO_URLS")
    expect(formatPipelineUserMessage(error)).toBe("一次请只发送一个视频链接")
  })

  it("falls back to heuristics for timeout errors", () => {
    expect(formatPipelineUserMessage(new Error("fetch failed: timeout"))).toContain("暂时不可用")
  })

  it("falls back to heuristics for fetch failed errors", () => {
    expect(formatPipelineUserMessage(new Error("fetch failed"))).toContain("暂时不可用")
  })

  it("falls back to heuristics for quota errors", () => {
    expect(formatPipelineUserMessage(new Error("余额不足"))).toContain("额度不足")
  })

  it("returns generic message for unknown errors", () => {
    expect(formatPipelineUserMessage(new Error("random error"))).toContain("未知错误")
  })

  it("returns generic message for non-Error values", () => {
    expect(formatPipelineUserMessage("string error")).toContain("未知错误")
  })
})

describe("isPipelineRetryable", () => {
  it("uses retryable from InspirationPipelineError", () => {
    expect(isPipelineRetryable(new InspirationPipelineError("VIDEO_TOO_LONG"))).toBe(false)
    expect(isPipelineRetryable(new InspirationPipelineError("EXTRACTION_SUBMIT_FAILED"))).toBe(true)
    expect(isPipelineRetryable(new InspirationPipelineError("RATE_LIMITED"))).toBe(true)
  })

  it("detects non-retryable Chinese error patterns in plain errors", () => {
    expect(isPipelineRetryable(new Error("视频超过10分钟"))).toBe(false)
    expect(isPipelineRetryable(new Error("超过200MB"))).toBe(false)
    expect(isPipelineRetryable(new Error("额度不足"))).toBe(false)
    expect(isPipelineRetryable(new Error("权限不足"))).toBe(false)
  })

  it("defaults to retryable for unknown plain errors", () => {
    expect(isPipelineRetryable(new Error("some unknown issue"))).toBe(true)
  })

  it("defaults to retryable for non-Error values", () => {
    expect(isPipelineRetryable("string")).toBe(true)
  })
})
