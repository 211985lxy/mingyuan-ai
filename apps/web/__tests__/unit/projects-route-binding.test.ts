import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  authenticateRequest,
  authErrorResponse,
  getAccountProjectContext,
  createInitialAccountProject,
  findMany,
  enforceCountBetaLimit,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  getAccountProjectContext: vi.fn(),
  createInitialAccountProject: vi.fn(),
  findMany: vi.fn(),
  enforceCountBetaLimit: vi.fn(async () => null),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/account-project-context", () => ({
  getAccountProjectContext,
  createInitialAccountProject,
}))
vi.mock("@/lib/prisma", () => ({ prisma: { clientProject: { findMany } } }))
vi.mock("@/lib/internal-beta-limits", () => ({ enforceCountBetaLimit }))

import { GET, POST } from "@/app/api/projects/route"

function makeRequest(method: string, body?: Record<string, unknown>, url = "http://localhost/api/projects") {
  return new NextRequest(url, {
    method,
    ...(body ? {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    } : {}),
  })
}

describe("/api/projects account binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    enforceCountBetaLimit.mockResolvedValue(null)
  })

  it("returns only the project bound to the logged-in account", async () => {
    const project = { id: "project-ai", name: "AI商业顾问", status: "active" }
    getAccountProjectContext.mockResolvedValue({ status: "bound", project })
    findMany.mockResolvedValue([project])

    const response = await GET(makeRequest("GET", undefined, "http://localhost/api/projects?status=all"))
    expect(response.status).toBe(200)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-ai", userId: "user-1" },
    }))
    await expect(response.json()).resolves.toEqual([project])
  })

  it("does not expose an unbound account's existing project list", async () => {
    getAccountProjectContext.mockResolvedValue({ status: "admin_review_required", projectCount: 2 })

    const response = await GET(makeRequest("GET"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })

  it("uses the atomic first-project binding flow for POST", async () => {
    const project = { id: "project-new", name: "我的IP", status: "active" }
    createInitialAccountProject.mockResolvedValue(project)

    const response = await POST(makeRequest("POST", { name: "我的IP" }))
    expect(response.status).toBe(201)
    expect(createInitialAccountProject).toHaveBeenCalledWith("user-1", expect.objectContaining({ name: "我的IP" }))
    await expect(response.json()).resolves.toEqual(project)
  })
})
