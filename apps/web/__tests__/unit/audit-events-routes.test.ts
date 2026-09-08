import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findMany, findUnique, count, recordAdminAudit } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  recordAdminAudit: vi.fn(async () => "request-audit-1"),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { auditEvent: { findMany, findUnique, count } } }))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/admin-auth", () => ({
  withAdminOnly: (handler: (request: NextRequest, context: { admin: { id: string }, params?: Record<string, string> }) => unknown) =>
    async (request: NextRequest, segmentData?: { params: Promise<Record<string, string>> }) =>
      handler(request, { admin: { id: "admin-1" }, params: segmentData ? await segmentData.params : undefined }),
}))

import { GET as listEvents } from "@/app/api/admin/audit-events/route"
import { GET as getEvent } from "@/app/api/admin/audit-events/[id]/route"

function request(url: string) {
  return new NextRequest(url, { method: "GET" })
}

const routeContext = { params: Promise.resolve({}) }

describe("audit event admin routes", () => {
  beforeEach(() => {
    findMany.mockReset()
    findUnique.mockReset()
    count.mockReset()
    recordAdminAudit.mockClear()
    count.mockResolvedValue(3)
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
    expect(body.nextCursor).toBe("event-3")
    expect(args.take).toBe(2)
    expect(args.where.occurredAt.gte.toISOString()).toBe("2026-09-07T16:00:00.000Z")
    expect(args.where.occurredAt.lt.toISOString()).toBe("2026-09-08T16:00:00.000Z")
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
})
