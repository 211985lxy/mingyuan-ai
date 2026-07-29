import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findMany, create, recordAdminAudit } = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  recordAdminAudit: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: (request: NextRequest, context: unknown) => unknown) =>
    (request: NextRequest) => handler(request, { admin: { id: "admin-real" } }),
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/prisma", () => ({
  prisma: { taskEfficiencyBaseline: { findMany, create } },
}))

import { GET, POST } from "@/app/api/admin/aim/efficiency-baselines/route"

describe("efficiency baseline admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findMany.mockResolvedValue([])
    create.mockResolvedValue({ id: "baseline-1" })
    recordAdminAudit.mockResolvedValue("audit-1")
  })

  it("persists a version with authenticated approver, ignoring spoofed approvedBy", async () => {
    const response = await POST(new NextRequest("http://localhost/api/admin/aim/efficiency-baselines", {
      method: "POST",
      body: JSON.stringify({
        workflowId: "content-growth-v1",
        taskType: "write_script",
        medianManualMinutes: 30,
        sampleSize: 12,
        validFrom: "2026-07-01T00:00:00Z",
        approvedBy: "spoofed",
      }),
    }))
    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ approvedBy: "admin-real" }),
    })
    expect(recordAdminAudit).toHaveBeenCalled()
  })

  it("rejects invalid sample size and bounds list reads", async () => {
    const bad = await POST(new NextRequest("http://localhost/api/admin/aim/efficiency-baselines", {
      method: "POST",
      body: JSON.stringify({
        workflowId: "w",
        taskType: "t",
        medianManualMinutes: 30,
        sampleSize: 0,
      }),
    }))
    expect(bad.status).toBe(400)
    await GET(new NextRequest("http://localhost/api/admin/aim/efficiency-baselines"))
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }))
  })
})
