import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findMany, findUnique, count, groupBy, recordAdminAudit } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  recordAdminAudit: vi.fn(async () => "request-audit-1"),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { auditEvent: { findMany, findUnique, count, groupBy } } }))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/admin-auth", () => ({
  withAdminOnly: (handler: (request: NextRequest, context: { admin: { id: string }, params?: Record<string, string> }) => unknown) =>
    async (request: NextRequest, segmentData?: { params: Promise<Record<string, string>> }) =>
      handler(request, { admin: { id: "admin-1" }, params: segmentData ? await segmentData.params : undefined }),
}))

import { GET as listEvents } from "@/app/api/admin/audit-events/route"
import { GET as getEvent } from "@/app/api/admin/audit-events/[id]/route"
import { GET as getRelatedEvents } from "@/app/api/admin/audit-events/[id]/related/route"

function request(url: string) {
  return new NextRequest(url, { method: "GET" })
}

const routeContext = { params: Promise.resolve({}) }

describe("audit event admin routes", () => {
  beforeEach(() => {
    findMany.mockReset()
    findUnique.mockReset()
    count.mockReset()
    groupBy.mockReset()
    recordAdminAudit.mockClear()
    count.mockResolvedValue(3)
    groupBy.mockResolvedValue([{ source: "aim" }, { source: "admin" }])
    findMany.mockResolvedValue([
      { id: "event-3", occurredAt: new Date("2026-09-08T02:00:00Z"), source: "aim" },
      { id: "event-2", occurredAt: new Date("2026-09-08T01:00:00Z"), source: "admin" },
    ])
  })

  it("defaults to today's Shanghai window and returns a cursor", async () => {
    const response = await listEvents(request("http://localhost/api/admin/audit-events?limit=1"), routeContext)
    const body = await response.json()
    const args = findMany.mock.calls[0][0]

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.nextCursor).toBeTruthy()
    expect(args.take).toBe(2)
    // 「今天」按 Asia/Shanghai 随钟计算（原硬编码日期随日历翻页即红）
    const shanghaiToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
    const start = new Date(`${shanghaiToday}T00:00:00+08:00`)
    start.setUTCDate(start.getUTCDate() - 6)
    expect(args.where.occurredAt.gte.toISOString()).toBe(
      start.toISOString(),
    )
    expect(args.where.occurredAt.lt.toISOString()).toBe(
      new Date(new Date(`${shanghaiToday}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    )
  })

  it("passes filters and an opaque cursor to Prisma", async () => {
    await listEvents(request("http://localhost/api/admin/audit-events?date=2026-09-01&source=admin&severity=error&action=delete&cursor=event-9"), routeContext)
    const args = findMany.mock.calls[0][0]
    expect(args.where.source).toBe("admin")
    expect(args.where.severity).toBe("error")
    expect(args.where.action).toEqual({ contains: "delete" })
    expect(args.cursor).toEqual({ id: "event-9" })
    expect(args.skip).toBe(1)
  })

  it("returns one event with its correlation chain", async () => {
    findUnique.mockResolvedValue({ id: "event-1", correlationId: "corr-1", source: "aim" })
    findMany.mockResolvedValue([
      { id: "event-1", correlationId: "corr-1" },
      { id: "event-2", correlationId: "corr-1" },
    ])
    const response = await getEvent(request("http://localhost/api/admin/audit-events/event-1"), {
      params: Promise.resolve({ id: "event-1" }),
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.event.id).toBe("event-1")
    expect(body.data.related).toHaveLength(2)
    expect(recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "audit_event.read" }))
  })

  it("returns 404 for an unknown event", async () => {
    findUnique.mockResolvedValue(null)
    const response = await getEvent(request("http://localhost/api/admin/audit-events/missing"), {
      params: Promise.resolve({ id: "missing" }),
    })
    expect(response.status).toBe(404)
  })

  it("returns full-filter summary counts independent of the page size", async () => {
    const { GET: getSummary } = await import("@/app/api/admin/audit-events/summary/route")
    count.mockReset()
    count.mockResolvedValueOnce(101).mockResolvedValueOnce(7).mockResolvedValueOnce(2)
    groupBy.mockResolvedValue([{ source: "aim" }, { source: "server" }, { source: "admin" }])
    const response = await getSummary(request("http://localhost/api/admin/audit-events/summary?from=2026-09-01&to=2026-09-07"), routeContext)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual(expect.objectContaining({ total: 101, failed: 7, critical: 2, sourceCount: 3, from: "2026-09-01", to: "2026-09-07" }))
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ["source"] }))
  })

  it("uses a stable timestamp and id cursor for related events", async () => {
    findUnique.mockResolvedValue({ correlationId: "corr-1" })
    findMany.mockResolvedValue([
      { id: "event-2", occurredAt: new Date("2026-09-08T01:00:00.000Z"), correlationId: "corr-1" },
      { id: "event-3", occurredAt: new Date("2026-09-08T02:00:00.000Z"), correlationId: "corr-1" },
    ])
    const cursor = Buffer.from(JSON.stringify({ id: "event-1", occurredAt: "2026-09-08T00:00:00.000Z" }), "utf8").toString("base64url")
    const response = await getRelatedEvents(request(`http://localhost/api/admin/audit-events/event-1/related?limit=1&cursor=${cursor}`), {
      params: Promise.resolve({ id: "event-1" }),
    })
    const body = await response.json()
    const args = findMany.mock.calls[0][0]
    expect(response.status).toBe(200)
    expect(args.where.AND[0].OR).toEqual([
      { occurredAt: { gt: new Date("2026-09-08T00:00:00.000Z") } },
      { occurredAt: new Date("2026-09-08T00:00:00.000Z"), id: { gt: "event-1" } },
    ])
    expect(body.data).toHaveLength(1)
    expect(body.nextCursor).toBeTruthy()
  })
})
