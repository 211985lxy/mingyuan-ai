import { describe, expect, it } from "vitest"
import { COPY_STUDIO_ROUTE_KEYS, copyStudioModuleFromRouteKey, isCopyStudioModule, normalizeRequestedCopyStudioModule, normalizeWorkbenchCopyStudioModule, resolveCopyStudioRouteKey, supportsCopyStudioModule } from "@/lib/copy-studio"
import { getAgentRecommendedModel, resolveAgentRouteKey } from "@/lib/llm/agent-router"

describe("copy studio module contract", () => {
  it("only accepts the four supported creator modes", () => {
    expect(isCopyStudioModule("social")).toBe(true)
    expect(isCopyStudioModule("longform")).toBe(true)
    expect(isCopyStudioModule("free")).toBe(true)
    expect(isCopyStudioModule("moments")).toBe(true)
    expect(isCopyStudioModule("video")).toBe(false)
  })

  it("maps modules to existing agent routes without changing production order", () => {
    expect(resolveCopyStudioRouteKey("social")).toBe(COPY_STUDIO_ROUTE_KEYS.social)
    expect(resolveCopyStudioRouteKey("moments")).toBe(COPY_STUDIO_ROUTE_KEYS.moments)
    expect(resolveAgentRouteKey("content_producer", "social")).toBe(COPY_STUDIO_ROUTE_KEYS.social)
    expect(resolveAgentRouteKey("content_producer", "longform")).toBe(COPY_STUDIO_ROUTE_KEYS.longform)
    expect(resolveAgentRouteKey("content_producer", "moments")).toBe(COPY_STUDIO_ROUTE_KEYS.moments)
    expect(getAgentRecommendedModel(COPY_STUDIO_ROUTE_KEYS.social)).toBe(getAgentRecommendedModel("content_producer"))
    // 深度长文归内容创作（alias → content_producer），不再走作品编辑
    expect(getAgentRecommendedModel(COPY_STUDIO_ROUTE_KEYS.longform)).toBe(getAgentRecommendedModel("content_producer"))
  })

  it("scopes workbench modes to the content producer while preserving API compatibility", () => {
    expect(normalizeWorkbenchCopyStudioModule("content_producer", "social")).toBe("social")
    expect(normalizeWorkbenchCopyStudioModule("business_diagnosis", "social")).toBeUndefined()
    expect(normalizeRequestedCopyStudioModule(undefined, "longform")).toBe("longform")
    expect(supportsCopyStudioModule("content_producer")).toBe(true)
    expect(supportsCopyStudioModule("work_editor")).toBe(true)
    expect(supportsCopyStudioModule("business_diagnosis")).toBe(false)
  })

  it("round-trips copy-studio route keys only", () => {
    expect(copyStudioModuleFromRouteKey("copy_studio.free")).toBe("free")
    expect(copyStudioModuleFromRouteKey("copy_studio.moments")).toBe("moments")
    expect(copyStudioModuleFromRouteKey("business_diagnosis")).toBeUndefined()
  })
})
