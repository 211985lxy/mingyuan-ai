import { describe, expect, it } from "vitest"

import {
  assertWorkflowTransition,
  canTransitionWorkflowStatus,
  getAllowedWorkflowTransitions,
} from "@/lib/aim/workflow-status"

describe("aim workflow status machine", () => {
  it("allows the main production path", () => {
    expect(canTransitionWorkflowStatus("draft", "pending_review")).toBe(true)
    expect(canTransitionWorkflowStatus("pending_review", "ready_to_shoot")).toBe(true)
    expect(canTransitionWorkflowStatus("ready_to_shoot", "shooting")).toBe(true)
    expect(canTransitionWorkflowStatus("shooting", "editing")).toBe(true)
    expect(canTransitionWorkflowStatus("editing", "ready_to_publish")).toBe(true)
    expect(canTransitionWorkflowStatus("ready_to_publish", "published")).toBe(true)
  })

  it("rejects illegal jumps such as draft → published", () => {
    expect(canTransitionWorkflowStatus("draft", "published")).toBe(false)
    expect(canTransitionWorkflowStatus("published", "draft")).toBe(false)
    expect(getAllowedWorkflowTransitions("archived")).toEqual([])
  })

  it("requires publishPlatform when entering published", () => {
    expect(
      assertWorkflowTransition({
        from: "ready_to_publish",
        to: "published",
      }).ok,
    ).toBe(false)

    expect(
      assertWorkflowTransition({
        from: "ready_to_publish",
        to: "published",
        publishPlatform: "抖音",
      }),
    ).toEqual({ ok: true, from: "ready_to_publish", to: "published" })
  })

  it("treats same-status as no-op", () => {
    expect(assertWorkflowTransition({ from: "editing", to: "editing" })).toEqual({
      ok: true,
      from: "editing",
      to: "editing",
    })
  })
})
