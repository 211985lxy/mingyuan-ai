import { describe, expect, it } from "vitest"
import { COPY_STUDIO_ROUTE_KEYS, isCopyStudioModule, resolveCopyStudioRouteKey } from "@/lib/copy-studio"
import { getAgentRecommendedModel, resolveAgentRouteKey } from "@/lib/llm/agent-router"

describe("copy studio module contract", () => {
  it("only accepts the three supported creator modes", () => {
    expect(isCopyStudioModule("social")).toBe(true)
    expect(isCopyStudioModule("longform")).toBe(true)
    expect(isCopyStudioModule("free")).toBe(true)
    expect(isCopyStudioModule("video")).toBe(false)
  })

  it("maps modules to existing agent routes without changing production order", () => {
    expect(resolveCopyStudioRouteKey("social")).toBe(COPY_STUDIO_ROUTE_KEYS.social)
    expect(resolveAgentRouteKey("content_producer", "social")).toBe(COPY_STUDIO_ROUTE_KEYS.social)
    expect(resolveAgentRouteKey("deep_copywriter", "longform")).toBe(COPY_STUDIO_ROUTE_KEYS.longform)
    expect(getAgentRecommendedModel(COPY_STUDIO_ROUTE_KEYS.social)).toBe(getAgentRecommendedModel("content_producer"))
    expect(getAgentRecommendedModel(COPY_STUDIO_ROUTE_KEYS.longform)).toBe(getAgentRecommendedModel("deep_copywriter"))
  })
})
