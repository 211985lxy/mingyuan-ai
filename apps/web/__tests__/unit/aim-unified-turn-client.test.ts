import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/core"
import { shouldRetryTransiently } from "@/hooks/aim-unified-turn-client"

describe("unified turn silent retry", () => {
  it("does not replay after the server already accepted the run", () => {
    expect(shouldRetryTransiently(new ApiError("模型超时", 503, {
      error: "模型超时",
      code: "MODEL_TIMEOUT",
      runId: "run_abc",
    }))).toBe(false)
  })

  it("retries a gateway timeout that never produced a runId", () => {
    expect(shouldRetryTransiently(new ApiError("网关超时", 504, { error: "网关超时" }))).toBe(true)
  })

  it("never silently retries delivery contract failures", () => {
    expect(shouldRetryTransiently(new ApiError("未交付", 422, { code: "DELIVERY_REASONING_LEAK" }))).toBe(false)
  })
})
