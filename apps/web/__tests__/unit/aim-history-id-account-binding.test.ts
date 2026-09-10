import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { authenticateRequest, authErrorResponse, resolveBoundProject, findFirst } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  resolveBoundProject: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: { aimGeneration: { findFirst } } }))

import { GET } from "@/app/api/aim/history/[id]/route"

describe("AIM history record account binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    resolveBoundProject.mockResolvedValue({ id: "project-ai", name: "AI商业顾问", status: "active" })
    findFirst.mockResolvedValue(null)
  })

  it("requires the record to belong to the account-bound project", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/aim/history/generation-1"),
      { params: Promise.resolve({ id: "generation-1" }) },
    )
    expect(response.status).toBe(404)
    expect(resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1" })
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "generation-1", projectId: "project-ai" },
    })
  })
})
