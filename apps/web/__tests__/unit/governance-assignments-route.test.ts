import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  withAdminAuth,
  recordAdminAudit,
  prisma,
} = vi.hoisted(() => {
  const governanceAssignment = {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  }
  return {
    withAdminAuth: (handler: unknown) => handler,
    recordAdminAudit: vi.fn(async () => "req_audit_1"),
    prisma: { governanceAssignment },
  }
})

vi.mock("@/lib/admin-auth", () => ({ withAdminAuth }))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/prisma", () => ({ prisma }))

import { GET, POST, PATCH } from "@/app/api/admin/governance-assignments/route"

function asAdminCtx() {
  return { admin: { id: "admin_1", email: "a@test.com", role: "admin" } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("governance-assignments API", () => {
  it("GET 强制分页上限", async () => {
    prisma.governanceAssignment.findMany.mockResolvedValueOnce([])
    prisma.governanceAssignment.count.mockResolvedValueOnce(0)
    const req = new NextRequest(
      "http://localhost/api/admin/governance-assignments?limit=9999&offset=0",
    )
    const res = await GET(req, asAdminCtx() as never)
    const body = await res.json()
    expect(body.limit).toBe(200)
    expect(prisma.governanceAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200, skip: 0 }),
    )
  })

  it("POST 创建并写审计", async () => {
    prisma.governanceAssignment.create.mockResolvedValueOnce({
      id: "ga_1",
      scopeType: "workflow",
      scopeId: "content-growth-v1",
      role: "business_owner",
      status: "active",
    })
    const req = new NextRequest("http://localhost/api/admin/governance-assignments", {
      method: "POST",
      body: JSON.stringify({
        scopeType: "workflow",
        scopeId: "content-growth-v1",
        role: "business_owner",
        externalOpenId: "ou_owner",
      }),
      headers: { "content-type": "application/json" },
    })
    const res = await POST(req, asAdminCtx() as never)
    expect(res.status).toBe(201)
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "governance_assignment.create" }),
    )
  })

  it("PATCH 停用并写审计", async () => {
    prisma.governanceAssignment.findUnique.mockResolvedValueOnce({
      id: "ga_1",
      scopeType: "workflow",
      scopeId: "content-growth-v1",
      role: "reviewer",
      status: "active",
    })
    prisma.governanceAssignment.update.mockResolvedValueOnce({
      id: "ga_1",
      scopeType: "workflow",
      scopeId: "content-growth-v1",
      role: "reviewer",
      status: "inactive",
    })
    const req = new NextRequest("http://localhost/api/admin/governance-assignments", {
      method: "PATCH",
      body: JSON.stringify({ id: "ga_1", status: "inactive" }),
      headers: { "content-type": "application/json" },
    })
    const res = await PATCH(req, asAdminCtx() as never)
    expect(res.status).toBe(200)
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "governance_assignment.deactivate" }),
    )
  })
})
