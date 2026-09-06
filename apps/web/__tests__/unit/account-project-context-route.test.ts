import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  authenticateRequest,
  authErrorResponse,
  getAccountProjectContext,
  createInitialAccountProject,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  getAccountProjectContext: vi.fn(),
  createInitialAccountProject: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/account-project-context", () => ({
  getAccountProjectContext,
  createInitialAccountProject,
}))

import { GET, POST } from "@/app/api/account/project-context/route"

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/account/project-context", {
    method,
    ...(body ? {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    } : {}),
  })
}

describe("account project context route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
  })

  it("returns the single project bound to the logged-in account", async () => {
    getAccountProjectContext.mockResolvedValue({
      status: "bound",
      project: { id: "project-ai", name: "AI商业顾问", status: "active" },
    })

    const response = await GET(makeRequest("GET"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: "bound",
      project: { id: "project-ai", name: "AI商业顾问", status: "active" },
    })
  })

  it("creates the first project and returns the binding", async () => {
    createInitialAccountProject.mockResolvedValue({
      id: "project-new",
      name: "我的IP项目",
      status: "active",
    })

    const response = await POST(makeRequest("POST", {
      name: "我的IP项目",
      industry: "教育",
    }))

    expect(response.status).toBe(201)
    expect(createInitialAccountProject).toHaveBeenCalledWith("user-1", {
      name: "我的IP项目",
      companyName: null,
      industry: "教育",
      targetCustomer: null,
      offer: null,
      deliveryGoal: null,
      notes: null,
    })
  })

  it("requires a non-empty project name", async () => {
    const response = await POST(makeRequest("POST", { name: "  " }))
    expect(response.status).toBe(400)
    expect(createInitialAccountProject).not.toHaveBeenCalled()
  })
})
