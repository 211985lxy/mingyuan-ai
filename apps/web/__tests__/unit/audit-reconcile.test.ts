import { beforeEach, describe, expect, it, vi } from "vitest"

const { checkpointUpsert, checkpointUpdate, reconcileAuditEvents } = vi.hoisted(() => ({
  checkpointUpsert: vi.fn(),
  checkpointUpdate: vi.fn(),
  reconcileAuditEvents: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { auditReconcileCheckpoint: { upsert: checkpointUpsert, update: checkpointUpdate } },
}))
vi.mock("@/lib/audit-events", () => ({ reconcileAuditEvents }))
vi.mock("@/lib/metrics", () => ({
  auditReconcileLagMs: { set: vi.fn() },
  auditReconcileFailuresTotal: { inc: vi.fn() },
}))

import { runAuditReconcileBatch } from "@/lib/audit-reconcile"

describe("audit reconciliation checkpoints", () => {
  beforeEach(() => {
    checkpointUpsert.mockReset()
    checkpointUpdate.mockReset()
    reconcileAuditEvents.mockReset()
    checkpointUpsert.mockImplementation(async (args: { where: { source: string } }) => ({
      source: args.where.source,
      backfillCursor: null,
      lastSuccessAt: null,
      lastError: null,
    }))
    checkpointUpdate.mockImplementation(async (args: { where: { source: string }; data: Record<string, unknown> }) => ({
      source: args.where.source,
      backfillCursor: (args.data.backfillCursor as string | null) ?? null,
      lastSuccessAt: (args.data.lastSuccessAt as Date) ?? null,
      lastError: (args.data.lastError as string | null) ?? null,
    }))
    reconcileAuditEvents.mockResolvedValue({ scanned: 2, indexed: 2, skipped: 0, nextCursor: null })
  })

  it("persists a separate cursor for each specialist source", async () => {
    const result = await runAuditReconcileBatch(new Date("2026-09-10T00:00:00.000Z"), 50)
    expect(result).toMatchObject({ scanned: 6, indexed: 6, failures: 0 })
    expect(checkpointUpsert).toHaveBeenCalledTimes(3)
    expect(reconcileAuditEvents).toHaveBeenCalledWith(50, undefined, "aimExecutionTrace")
    expect(checkpointUpdate).toHaveBeenCalledTimes(3)
  })

  it("records a source error and continues the other sources", async () => {
    reconcileAuditEvents.mockRejectedValueOnce(new Error("source unavailable"))
    const result = await runAuditReconcileBatch()
    expect(result.failures).toBe(1)
    expect(result.checkpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ error: "source unavailable" }),
    ]))
    expect(reconcileAuditEvents).toHaveBeenCalledTimes(3)
  })
})
