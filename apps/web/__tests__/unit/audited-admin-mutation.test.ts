import { beforeEach, describe, expect, it, vi } from "vitest"

const { transaction, auditCreate, recordAuditEvent } = vi.hoisted(() => ({
  transaction: vi.fn(),
  auditCreate: vi.fn(),
  recordAuditEvent: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
    adminAuditLog: { create: auditCreate },
  },
}))
vi.mock("@/lib/audit-events", () => ({
  recordAuditEvent,
  specialistAuditInput: (input: unknown) => input,
}))

import { runAuditedAdminMutation } from "@/lib/audited-admin-mutation"

function request() {
  return new Request("https://example.test/api/admin/settings", {
    headers: { "x-request-id": "req-1", "x-correlation-id": "corr-1" },
  }) as never
}

describe("runAuditedAdminMutation", () => {
  beforeEach(() => {
    transaction.mockReset()
    auditCreate.mockReset()
    recordAuditEvent.mockReset()
    auditCreate.mockResolvedValue({ id: "audit-1" })
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ adminAuditLog: { create: auditCreate } }))
  })

  it("writes the source row in the same transaction and indexes after commit", async () => {
    const result = await runAuditedAdminMutation({
      request: request(),
      adminId: "admin-1",
      action: "settings.updated",
      targetType: "setting",
      targetId: "site.name",
      mutate: async () => ({ ok: true }),
    })
    expect(result).toMatchObject({ result: { ok: true }, auditId: "audit-1", requestId: "req-1", correlationId: "corr-1" })
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "success", correlationId: "corr-1" }) }))
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "success", sourceRecordId: "audit-1" }))
  })

  it("records a failed source event after a rolled-back mutation", async () => {
    transaction.mockRejectedValueOnce(new Error("mutation failed"))
    await expect(runAuditedAdminMutation({
      request: request(),
      adminId: "admin-1",
      action: "settings.updated",
      targetType: "setting",
      mutate: async () => ({ ok: false }),
    })).rejects.toThrow("mutation failed")
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed", severity: "error" }) }))
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }))
  })
})
