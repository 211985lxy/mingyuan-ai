import { beforeEach, describe, expect, it, vi } from "vitest"

const { auditCount, auditFindMany, auditDeleteMany, channelCount, channelFindMany, channelDeleteMany, adminLogCount, adminLogFindMany, adminLogDeleteMany, reconcileCount, reconcileDeleteMany } = vi.hoisted(() => ({
  auditCount: vi.fn(), auditFindMany: vi.fn(), auditDeleteMany: vi.fn(),
  channelCount: vi.fn(), channelFindMany: vi.fn(), channelDeleteMany: vi.fn(),
  adminLogCount: vi.fn(), adminLogFindMany: vi.fn(), adminLogDeleteMany: vi.fn(),
  reconcileCount: vi.fn(), reconcileDeleteMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { auditEvent: { count: auditCount, findMany: auditFindMany, deleteMany: auditDeleteMany }, channelMetricDaily: { count: channelCount, findMany: channelFindMany, deleteMany: channelDeleteMany }, adminAuditLog: { count: adminLogCount, findMany: adminLogFindMany, deleteMany: adminLogDeleteMany }, auditReconcileCheckpoint: { count: reconcileCount, deleteMany: reconcileDeleteMany } } }))

import { deleteExpiredControlCenterRows, previewControlCenterRetention } from "@/lib/control-center-retention"

describe("control center retention", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    auditCount.mockResolvedValue(3); channelCount.mockResolvedValue(2)
    auditFindMany.mockResolvedValue([]); channelFindMany.mockResolvedValue([])
    auditDeleteMany.mockResolvedValue({ count: 0 }); channelDeleteMany.mockResolvedValue({ count: 0 })
    adminLogCount.mockResolvedValue(9); adminLogFindMany.mockResolvedValue([]); adminLogDeleteMany.mockResolvedValue({ count: 0 })
    reconcileCount.mockResolvedValue(1); reconcileDeleteMany.mockResolvedValue({ count: 0 })
  })

  it("previews 180-day boundaries without deleting", async () => {
    const result = await previewControlCenterRetention(new Date("2026-09-10T00:00:00.000Z"))
    expect(result).toMatchObject({ auditEventExpired: 3, channelMetricDailyExpired: 2, totalExpired: 5, cutoffDay: "2026-03-14" })
    expect(auditDeleteMany).not.toHaveBeenCalled()
  })

  it("deletes in bounded batches only when execute is true", async () => {
    auditFindMany.mockResolvedValueOnce([{ id: "a1" }, { id: "a2" }]).mockResolvedValueOnce([])
    channelFindMany.mockResolvedValueOnce([{ id: "c1" }]).mockResolvedValueOnce([])
    auditDeleteMany.mockResolvedValueOnce({ count: 2 }); channelDeleteMany.mockResolvedValueOnce({ count: 1 })
    const result = await deleteExpiredControlCenterRows({ now: new Date("2026-09-10T00:00:00.000Z"), execute: true })
    expect(result).toMatchObject({ execute: true, auditEventDeleted: 2, channelMetricDailyDeleted: 1, batches: 2 })
    expect(auditDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a1", "a2"] } } })
  })

  it("stays report-only when execute is false", async () => {
    const result = await deleteExpiredControlCenterRows({ now: new Date("2026-09-10T00:00:00.000Z"), execute: false })
    expect(result).toMatchObject({ execute: false, totalExpired: 5, auditEventDeleted: 0, channelMetricDailyDeleted: 0, batches: 0 })
    expect(auditFindMany).not.toHaveBeenCalled()
    expect(channelFindMany).not.toHaveBeenCalled()
    expect(auditDeleteMany).not.toHaveBeenCalled()
    expect(channelDeleteMany).not.toHaveBeenCalled()
  })

  it("pages through 1000-row batches until the source is exhausted", async () => {
    auditFindMany
      .mockResolvedValueOnce(Array.from({ length: 1000 }, (_, i) => ({ id: `a1-${i}` })))
      .mockResolvedValueOnce([])
    channelFindMany.mockResolvedValue([])
    auditDeleteMany.mockResolvedValue({ count: 1000 })
    const result = await deleteExpiredControlCenterRows({ now: new Date("2026-09-10T00:00:00.000Z"), execute: true })
    expect(auditFindMany).toHaveBeenNthCalledWith(1, { where: { ingestedAt: { lt: new Date("2026-03-14T00:00:00.000Z") } }, select: { id: true }, take: 1000 })
    expect(auditDeleteMany).toHaveBeenCalledTimes(1)
    expect(auditDeleteMany).toHaveBeenCalledWith({ where: { id: { in: expect.arrayContaining(["a1-0", "a1-999"]) } } })
    expect(result).toMatchObject({ execute: true, auditEventDeleted: 1000, channelMetricDailyDeleted: 0, batches: 1 })
  })

  it("stops after the 20-batch maximum per source", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `x-${i}` }))
    auditFindMany.mockResolvedValue(fullPage)
    channelFindMany.mockResolvedValue(fullPage)
    auditDeleteMany.mockResolvedValue({ count: 1000 })
    channelDeleteMany.mockResolvedValue({ count: 1000 })
    const result = await deleteExpiredControlCenterRows({ now: new Date("2026-09-10T00:00:00.000Z"), execute: true })
    expect(auditDeleteMany).toHaveBeenCalledTimes(20)
    expect(channelDeleteMany).toHaveBeenCalledTimes(20)
    expect(result).toMatchObject({ execute: true, auditEventDeleted: 20000, channelMetricDailyDeleted: 20000, batches: 40 })
  })

  it("never touches specialist source tables", async () => {
    auditFindMany.mockResolvedValue([{ id: "a1" }])
    channelFindMany.mockResolvedValue([{ id: "c1" }])
    auditDeleteMany.mockResolvedValue({ count: 1 }); channelDeleteMany.mockResolvedValue({ count: 1 })
    await previewControlCenterRetention(new Date("2026-09-10T00:00:00.000Z"))
    await deleteExpiredControlCenterRows({ now: new Date("2026-09-10T00:00:00.000Z"), execute: true })
    expect(adminLogCount).not.toHaveBeenCalled()
    expect(adminLogFindMany).not.toHaveBeenCalled()
    expect(adminLogDeleteMany).not.toHaveBeenCalled()
    expect(reconcileDeleteMany).not.toHaveBeenCalled()
  })
})
