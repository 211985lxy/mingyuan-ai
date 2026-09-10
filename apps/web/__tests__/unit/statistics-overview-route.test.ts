import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const loadStatisticsOverview = vi.hoisted(() => vi.fn())
const recordAdminAudit = vi.hoisted(() => vi.fn(async () => "audit-request-1"))

vi.mock("@/lib/statistics-center", () => ({
  parseStatisticsRange: (params: URLSearchParams) => ({ from: params.get("from") || "2026-09-01", to: params.get("to") || "2026-09-07", start: new Date("2026-08-31T16:00:00.000Z"), end: new Date("2026-09-07T16:00:00.000Z") }),
  loadStatisticsOverview,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/admin-auth", () => ({
  withAdminOnly: (handler: (request: NextRequest, context: { admin: { id: string } }) => unknown) => (request: NextRequest) => handler(request, { admin: { id: "admin-1" } }),
}))

import { GET } from "@/app/api/admin/statistics/overview/route"

describe("statistics overview route", () => {
  it("passes bounded filters to the domain loader", async () => {
    loadStatisticsOverview.mockResolvedValue({ operations: { runCount: 1 }, business: null, degradedSources: [] })
    const response = await GET(new NextRequest("http://localhost/api/admin/statistics/overview?from=2026-09-01&to=2026-09-07&projectId=p1&channel=feishu"))
    expect(response.status).toBe(200)
    expect(loadStatisticsOverview).toHaveBeenCalledWith(expect.objectContaining({ filters: expect.objectContaining({ projectId: "p1", channel: "feishu" }) }))
    expect(recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "statistics.overview.read" }))
  })
})
