import { beforeEach, describe, expect, it, vi } from "vitest"

const { upsert, error } = vi.hoisted(() => ({
  upsert: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { auditEvent: { upsert } } }))
vi.mock("@/lib/logger", () => ({ logger: { error } }))

import { recordAuditEvent, specialistAuditInput } from "@/lib/audit-events"

describe("audit event writer", () => {
  beforeEach(() => {
    upsert.mockReset()
    error.mockReset()
    upsert.mockResolvedValue({ id: "event-1" })
  })

  it("writes redacted normalized data with a stable source key", async () => {
    const result = await recordAuditEvent(specialistAuditInput({
      source: "admin",
      category: "operation",
      status: "success",
      action: "profile.publish",
      summary: "档案已发布",
      sourceRecordType: "AdminAuditLog",
      sourceRecordId: "audit-1",
      actorId: "admin-1",
      metadata: { email: "hidden@example.com", count: 1 },
    }))

    expect(result).toEqual({ ok: true, id: "event-1", inserted: true })
    const args = upsert.mock.calls[0][0]
    expect(args.where.source_idempotencyKey).toEqual({
      source: "admin",
      idempotencyKey: "admin:AdminAuditLog:audit-1",
    })
    expect(args.create.metadata).toEqual({ count: 1 })
    expect(args.create.actorIdHash).toHaveLength(16)
  })

  it("does not throw when the index is unavailable in best-effort mode", async () => {
    upsert.mockRejectedValue(new Error("database unavailable"))
    const result = await recordAuditEvent({
      source: "server",
      category: "runtime",
      severity: "error",
      status: "failed",
      action: "health.check",
      summary: "health check failed",
    })

    expect(result.ok).toBe(false)
    expect(error).toHaveBeenCalledOnce()
  })

  it("can opt into strict errors for mandatory callers", async () => {
    upsert.mockRejectedValue(new Error("database unavailable"))
    await expect(recordAuditEvent({
      source: "admin",
      category: "operation",
      severity: "critical",
      status: "failed",
      action: "data.delete",
      summary: "delete failed",
    }, { strict: true })).rejects.toThrow("database unavailable")
  })
})
