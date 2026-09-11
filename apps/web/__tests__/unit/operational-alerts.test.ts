import { beforeEach, describe, expect, it, vi } from "vitest"

const { findUnique, create, update, findMany, sendAlert } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  sendAlert: vi.fn(),
}))

vi.mock("@/env", () => ({ env: { AIM_LOOP_NOTIFICATIONS_ENABLED: "true" } }))
vi.mock("@/lib/prisma", () => ({ prisma: { operationalAlert: { findUnique, create, update, findMany } } }))
vi.mock("@/lib/aim/feishu-supervisor-notifier", () => ({
  readSupervisorNotificationConfig: vi.fn(() => ({ enabled: true, appId: "app", appSecret: "secret", chatId: "chat" })),
  sanitizeSupervisorText: (value: string) => value,
  sendFeishuSystemAlert: sendAlert,
}))

import { transitionOperationalAlert, upsertOperationalAlert } from "@/lib/operational-alerts"

const row = {
  id: "alert-1", fingerprint: "aim-failure-rate:30m", rule: "aim_failure_rate", severity: "error", status: "open",
  summary: "失败率过高", source: "aim_execution", correlationId: null, metadata: {},
  firstSeenAt: new Date("2026-09-10T00:00:00Z"), lastSeenAt: new Date("2026-09-10T00:00:00Z"), occurrenceCount: 1,
  lastNotifiedAt: null, acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null,
  createdAt: new Date("2026-09-10T00:00:00Z"), updatedAt: new Date("2026-09-10T00:00:00Z"),
}

describe("operational alerts", () => {
  beforeEach(() => {
    findUnique.mockReset(); create.mockReset(); update.mockReset(); findMany.mockReset(); sendAlert.mockReset()
    findUnique.mockResolvedValue(null)
    create.mockResolvedValue(row)
    update.mockResolvedValue(row)
    sendAlert.mockResolvedValue(undefined)
  })

  it("creates and notifies error alerts", async () => {
    const result = await upsertOperationalAlert({ fingerprint: row.fingerprint, rule: row.rule, severity: "error", summary: row.summary, source: row.source })
    expect(result.row.id).toBe("alert-1")
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "open", severity: "error" }) }))
    expect(sendAlert).toHaveBeenCalledOnce()
  })

  it("deduplicates within the notification window and increments occurrences", async () => {
    findUnique.mockResolvedValueOnce({ ...row, lastNotifiedAt: new Date("2026-09-10T00:00:00Z") })
    await upsertOperationalAlert({ fingerprint: row.fingerprint, rule: row.rule, severity: "error", summary: row.summary, source: row.source, now: new Date("2026-09-10T00:05:00Z") })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ occurrenceCount: { increment: 1 } }) }))
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it("transitions an alert with explicit state fields", async () => {
    findUnique.mockResolvedValue(row)
    const result = await transitionOperationalAlert({ id: "alert-1", transition: "resolved", adminId: "admin-1" })
    expect(result).toEqual(row)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "resolved", resolvedBy: "admin-1" }) }))
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ summary: "告警已恢复：失败率过高" }))
  })

  it("does not send a second recovery notification for an already resolved alert", async () => {
    findUnique.mockResolvedValue({ ...row, status: "resolved" })
    await transitionOperationalAlert({ id: "alert-1", transition: "resolved", adminId: "admin-1" })
    expect(sendAlert).not.toHaveBeenCalled()
  })
})
