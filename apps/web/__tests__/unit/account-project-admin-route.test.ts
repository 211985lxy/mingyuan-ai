import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { withAdminOnly, bindAccountProject, deriveStatus, recordAdminAudit, userFindMany } = vi.hoisted(() => ({
  withAdminOnly: vi.fn((handler: (request: NextRequest, context: { admin: { id: string } }) => unknown) =>
    (request: NextRequest) => handler(request, { admin: { id: "admin-1" } })),
  bindAccountProject: vi.fn(),
  deriveStatus: vi.fn((input: { boundProjectId: string | null; projects: Array<{ status: string }> }) => {
    if (input.boundProjectId) return "bound"
    const active = input.projects.filter((project) => project.status === "active").length
    const inactive = input.projects.filter(
      (project) => project.status === "paused" || project.status === "archived",
    ).length
    if (active > 0) return "admin_review_required"
    if (inactive > 0) return "inactive_project_recovery_required"
    return "setup_required"
  }),
  recordAdminAudit: vi.fn(async () => "audit-1"),
  userFindMany: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ withAdminOnly }))
vi.mock("@/lib/account-project-context", () => ({
  bindAccountProject,
  deriveAccountProjectBindingStatus: deriveStatus,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: userFindMany } } }))

import { GET as GETHandler, POST as POSTHandler } from "@/app/api/admin/account-project-bindings/route"

// withAdminOnly 返回双参签名（request + segmentData.params）；测试统一注入空路由参数。
const withAdminContext = <R>(
  handler: (req: NextRequest, segmentData: { params: Promise<Record<string, string>> }) => R,
) =>
  (req: NextRequest): R => handler(req, { params: Promise.resolve({}) })
const GET = withAdminContext(GETHandler)
const POST = withAdminContext(POSTHandler)

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/account-project-bindings", {
    method,
    ...(body ? {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    } : {}),
  })
}

describe("admin account project binding route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists binding status for account review", async () => {
    userFindMany.mockResolvedValue([
      {
        id: "user-1",
        email: "owner@example.com",
        name: "Owner",
        boundProjectId: "project-ai",
        projectBoundAt: null,
        projectBindingSource: "admin_review",
        clientProjects: [{ id: "project-ai", name: "AI商业顾问", status: "active" }],
      },
      {
        id: "user-2",
        email: "review@example.com",
        name: "Review",
        boundProjectId: null,
        projectBoundAt: null,
        projectBindingSource: null,
        clientProjects: [{ id: "project-old", name: "旧项目", status: "active" }],
      },
    ])

    const response = await GET(makeRequest("GET"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        expect.objectContaining({ userId: "user-1", status: "bound", boundProjectId: "project-ai" }),
        expect.objectContaining({ userId: "user-2", status: "admin_review_required", projectCount: 1 }),
      ],
    })
    expect(deriveStatus).toHaveBeenCalledTimes(2)
  })

  it("flags accounts that only own paused/archived projects for inactive-project recovery", async () => {
    userFindMany.mockResolvedValue([
      {
        id: "user-3",
        email: "paused@example.com",
        name: "Paused",
        boundProjectId: null,
        projectBoundAt: null,
        projectBindingSource: null,
        clientProjects: [
          { id: "project-paused", name: "停用项目", status: "paused" },
          { id: "project-archived", name: "归档项目", status: "archived" },
        ],
      },
    ])

    const response = await GET(makeRequest("GET"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        expect.objectContaining({
          userId: "user-3",
          status: "inactive_project_recovery_required",
          projectCount: 2,
        }),
      ],
    })
  })

  it("binds a selected project and records an admin audit", async () => {
    const project = { id: "project-ai", userId: "user-1", name: "AI商业顾问", status: "active" }
    // The real service runs its own transaction and calls the audit hook
    // (withinTransaction) before commit; mirror that contract here.
    bindAccountProject.mockImplementation(async ({ withinTransaction }: { withinTransaction?: (tx: unknown) => Promise<void> }) => {
      if (withinTransaction) await withinTransaction("tx-sentinel")
      return project
    })

    const response = await POST(makeRequest("POST", { userId: "user-1", projectId: "project-ai" }))
    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toBe("audit-1")
    await expect(response.json()).resolves.toEqual({ status: "bound", project })
    expect(bindAccountProject).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: "project-ai",
      source: "admin_review",
      withinTransaction: expect.any(Function),
    })
    expect(recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      adminId: "admin-1",
      action: "account_project.bind",
      targetId: "user-1",
    }), "tx-sentinel")
  })
})
