import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { authenticateRequest, authErrorResponse, resolveBoundProject, findMany, count } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  resolveBoundProject: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: { aimGeneration: { findMany, count } } }))

import { GET } from "@/app/api/aim/history/route"

function makeRequest(url = "http://localhost/api/aim/history") {
  return new NextRequest(url)
}

describe("AIM history account binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    resolveBoundProject.mockResolvedValue({ id: "project-ai", name: "AI商业顾问", status: "active" })
    findMany.mockResolvedValue([])
    count.mockResolvedValue(0)
  })

  it("always scopes history to the account-bound project", async () => {
    const response = await GET(makeRequest("http://localhost/api/aim/history?projectId=project-other&agentId=content_producer"))
    expect(response.status).toBe(200)
    expect(resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: "project-other" })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ projectId: "project-ai" }),
    }))
  })

  it("returns a conflict instead of leaking another project's history", async () => {
    resolveBoundProject.mockRejectedValueOnce({
      message: "当前账号只能使用已绑定的项目",
      code: "PROJECT_CONTEXT_MISMATCH",
      status: 409,
    })

    const response = await GET(makeRequest("http://localhost/api/aim/history?projectId=project-other"))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ code: "PROJECT_CONTEXT_MISMATCH" }))
    expect(findMany).not.toHaveBeenCalled()
  })
})
