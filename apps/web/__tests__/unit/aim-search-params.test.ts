import { describe, expect, it } from "vitest"

import { parseAimSearchParams } from "@/features/aim/aim-search-params"

describe("AIM search params", () => {
  it("accepts stable project and generation deep links", () => {
    const result = parseAimSearchParams(new URLSearchParams("mode=quick&projectId=project-1&generationId=gen_123&stage=content"))
    expect(result.modeParam).toBe("quick")
    expect(result.projectIdParam).toBe("project-1")
    expect(result.generationIdParam).toBe("gen_123")
    expect(result.workflowStageParam).toBe("content")
  })

  it("rejects malformed generation ids", () => {
    expect(parseAimSearchParams(new URLSearchParams("generationId=bad/id")).generationIdParam).toBeNull()
  })
})
