import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/core"
import { shouldRetryTransiently } from "@/hooks/aim-unified-turn-client"
import { buildWebAttemptId, usesUnifiedAimExecuteEntry } from "@/lib/aim/unified-execute-entry"

describe("unified execute entry", () => {
  it("covers content creation, business diagnosis and aliases", () => {
    expect(usesUnifiedAimExecuteEntry("content_producer")).toBe(true)
    expect(usesUnifiedAimExecuteEntry("ip_video")).toBe(true)
    expect(usesUnifiedAimExecuteEntry("business_diagnosis")).toBe(true)
    expect(usesUnifiedAimExecuteEntry("business_system_diagnosis")).toBe(true)
    expect(usesUnifiedAimExecuteEntry("work_editor")).toBe(false)
  })

  it("builds a stable web_ attempt id from a trace uuid", () => {
    expect(buildWebAttemptId("c0ffee12-3456-7890-abcd-ef0123456789")).toBe("web_c0ffee1234567890abcdef01")
  })
})

describe("unified turn silent retry", () => {
  it("does not replay after the server already accepted the run", () => {
    expect(shouldRetryTransiently(new ApiError("模型超时", 503, {
      error: "模型超时",
      code: "MODEL_TIMEOUT",
      runId: "run_abc",
    }))).toBe(false)
  })

  it("does not replay after a generationId is assigned", () => {
    expect(shouldRetryTransiently(new ApiError("仍在执行", 409, {
      code: "GENERATION_IN_PROGRESS",
      generationId: "web_0123456789abcdef01234567",
    }))).toBe(false)
  })

  it("retries a gateway timeout that never produced a runId", () => {
    expect(shouldRetryTransiently(new ApiError("网关超时", 504, { error: "网关超时" }))).toBe(true)
  })

  it("never silently retries delivery contract failures", () => {
    expect(shouldRetryTransiently(new ApiError("未交付", 422, { code: "DELIVERY_CONSTRAINT_VIOLATION" }))).toBe(false)
  })
})
