import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { authenticateRequest, resolveBoundProject, findMany, create } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  resolveBoundProject: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse: vi.fn(() => null) }))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error { code = "PROJECT_CONTEXT_MISMATCH"; status = 409 },
}))
vi.mock("@/lib/prisma", () => ({ prisma: {
  agentApiKey: { findMany, create },
  clientProject: { findMany: vi.fn() },
} }))

import { POST } from "@/app/api/account/agent-keys/route"

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/account/agent-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("agent API key account binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    resolveBoundProject.mockResolvedValue({ id: "project-ai", name: "AI商业顾问", status: "active" })
    create.mockResolvedValue({ id: "key-1" })
  })

  it("stores exactly the account-bound project in a new key", async () => {
    const response = await POST(request({
      name: "内容助手",
      clientType: "custom",
      projects: ["project-ai"],
    }))
    expect(response.status).toBe(201)
    expect(resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: "project-ai" })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ allowedProjects: ["project-ai"] }),
    }))
  })

  it("rejects multi-project keys", async () => {
    const response = await POST(request({
      name: "内容助手",
      clientType: "custom",
      projects: ["project-ai", "project-other"],
    }))
    expect(response.status).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })
})
