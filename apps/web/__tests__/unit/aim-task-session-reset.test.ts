import { describe, expect, it } from "vitest"

import {
  resolveAimWorkflowBriefForRequest,
  shouldKeepAimFollowUpContext,
  stripAimTaskScopedSearchParams,
} from "@/lib/aim/task-session-reset"

describe("aim task session reset", () => {
  it("strips task-scoped URL params while keeping agent/project/mode", () => {
    const params = new URLSearchParams(
      "agent=content_producer&projectId=p1&mode=quick&generationId=g1&topicSelectionId=t1&idea=x&stage=content",
    )
    expect(stripAimTaskScopedSearchParams(params)).toBe(true)
    expect(params.get("agent")).toBe("content_producer")
    expect(params.get("projectId")).toBe("p1")
    expect(params.get("mode")).toBe("quick")
    expect(params.get("generationId")).toBeNull()
    expect(params.get("topicSelectionId")).toBeNull()
    expect(params.get("idea")).toBeNull()
    expect(params.get("stage")).toBeNull()
  })

  it("does not keep follow-up context on empty history or explicit new task", () => {
    expect(shouldKeepAimFollowUpContext(false, 0)).toBe(false)
    expect(shouldKeepAimFollowUpContext(undefined, 0)).toBe(false)
    expect(shouldKeepAimFollowUpContext(true, 4)).toBe(false)
    expect(shouldKeepAimFollowUpContext(false, 2)).toBe(true)
  })

  it("drops stale workflow brief unless keepContext or explicit override", () => {
    const stale = { sourceGenerationId: "old-gen", confirmed: { angle: "旧选题" } }
    const fresh = { sourceGenerationId: undefined, confirmed: { angle: "新计划" } }

    expect(resolveAimWorkflowBriefForRequest({
      keepContext: false,
      currentBrief: stale,
    })).toBeNull()

    expect(resolveAimWorkflowBriefForRequest({
      keepContext: true,
      currentBrief: stale,
    })).toEqual(stale)

    expect(resolveAimWorkflowBriefForRequest({
      keepContext: false,
      currentBrief: stale,
      override: fresh,
    })).toEqual(fresh)

    expect(resolveAimWorkflowBriefForRequest({
      keepContext: false,
      currentBrief: stale,
      override: null,
    })).toBeNull()
  })
})
