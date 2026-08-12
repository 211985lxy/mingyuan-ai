import { describe, expect, it } from "vitest"

import { canTransitionProductionStatus, validateProductionExecutionSpec } from "@/lib/aim/production-execution-spec"
import { createManualProductionHandoff } from "@/lib/aim/production/manual-handoff-adapter"

describe("provider-neutral production execution", () => {
  it("allows only forward production transitions", () => {
    expect(canTransitionProductionStatus("not_started", "prepared")).toBe(true)
    expect(canTransitionProductionStatus("prepared", "completed")).toBe(true)
    expect(canTransitionProductionStatus("completed", "processing")).toBe(false)
  })

  it("requires deliverable evidence before completion", () => {
    expect(validateProductionExecutionSpec({
      schemaVersion: 1, kind: "video", adapter: "manual", status: "completed",
      sourceGenerationId: "gen-1", updatedAt: new Date().toISOString(),
    })).toEqual({ ok: false, error: expect.stringContaining("交付") })
  })

  it("creates an executable manual handoff without pretending a video exists", () => {
    const result = createManualProductionHandoff({
      sourceGenerationId: "gen-1",
      kind: "shooting_handoff",
      title: "Founder story",
      approvedContent: "Approved script",
      owner: "Content team",
      dueAt: "2026-08-13T10:00:00.000Z",
    })
    expect(result.spec.status).toBe("prepared")
    expect(result.spec.deliverableUrl).toBeUndefined()
    expect(result.handoffText).toContain("Approved script")
  })
})
