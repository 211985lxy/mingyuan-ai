import { beforeEach, describe, expect, it, vi } from "vitest"

const { upsert, error, adminFindMany, aimFindMany, agentFindMany } = vi.hoisted(() => ({
  upsert: vi.fn(),
  error: vi.fn(),
  adminFindMany: vi.fn(),
  aimFindMany: vi.fn(),
  agentFindMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditEvent: { upsert },
    adminAuditLog: { findMany: adminFindMany },
    aimExecutionTrace: { findMany: aimFindMany },
    agentApiCallLog: { findMany: agentFindMany },
  },
}))
vi.mock("@/lib/logger", () => ({ logger: { error } }))

import { reconcileAuditEvents, recordAgentApiAudit, recordAuditEvent, specialistAuditInput } from "@/lib/audit-events"

describe("audit event writer", () => {
  beforeEach(() => {
    upsert.mockReset()
    error.mockReset()
    adminFindMany.mockReset()
    aimFindMany.mockReset()
    agentFindMany.mockReset()
    upsert.mockResolvedValue({ id: "event-1" })
    adminFindMany.mockResolvedValue([])
    aimFindMany.mockResolvedValue([])
    agentFindMany.mockResolvedValue([])
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

  it("indexes Agent API calls without copying request content", async () => {
    await recordAgentApiAudit({
      recordId: "agent-log-1",
      userId: "user-1",
      projectId: "project-1",
      agentId: "copywriter",
      action: "aim.generate",
      status: "success",
      durationMs: 321,
    })

    const args = upsert.mock.calls[0][0]
    expect(args.create.source).toBe("agent_api")
    expect(args.create.targetId).toBe("copywriter")
    expect(args.create.metadata).toEqual({ durationMs: 321, agentId: "copywriter" })
    expect(args.create.idempotencyKey).toBe("agent_api:AgentApiCallLog:agent-log-1")
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

  it("returns a resumable cursor after a bounded reconciliation page", async () => {
    adminFindMany.mockResolvedValueOnce([{
      id: "audit-2",
      adminId: "admin-2",
      action: "settings.update",
      targetType: "setting",
      targetId: "site.name",
      requestId: "req-2",
      createdAt: new Date("2026-09-08T01:02:03.000Z"),
      metadata: {},
    }])

    const result = await reconcileAuditEvents(1)
    expect(result.scanned).toBe(1)
    expect(result.indexed).toBe(1)
    expect(result.nextCursor).toBeTruthy()
    expect(JSON.parse(Buffer.from(result.nextCursor!, "base64url").toString("utf8")).adminAuditLog).toEqual({
      id: "audit-2",
      createdAt: "2026-09-08T01:02:03.000Z",
    })
    expect(upsert).toHaveBeenCalledOnce()
  })
})
