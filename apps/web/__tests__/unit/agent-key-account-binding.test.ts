import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { authenticateRequest, resolveBoundProject, findMany, create, transaction, queryRawUnsafe, userFindUnique, projectFindUnique } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  resolveBoundProject: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  queryRawUnsafe: vi.fn(),
  userFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse: vi.fn(() => null) }))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error { code = "PROJECT_CONTEXT_MISMATCH"; status = 409 },
}))
vi.mock("@/lib/prisma", () => ({ prisma: {
  agentApiKey: { findMany, create },
  clientProject: { findMany: vi.fn(), findUnique: projectFindUnique },
  user: { findUnique: userFindUnique },
  $queryRawUnsafe: queryRawUnsafe,
  $transaction: transaction,
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
    userFindUnique.mockResolvedValue({ id: "user-1", boundProjectId: "project-ai" })
    projectFindUnique.mockResolvedValue({ id: "project-ai", name: "AI商业顾问", status: "active", userId: "user-1", members: [{ userId: "user-1" }] })
    transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => run({
      agentApiKey: { create },
      clientProject: { findUnique: projectFindUnique },
      user: { findUnique: userFindUnique },
      $queryRawUnsafe: queryRawUnsafe,
    }))
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

  it("locks the bound project then the user and revalidates before creating", async () => {
    const order: string[] = []
    queryRawUnsafe.mockImplementation(async (sql: string) => {
      order.push(sql.includes("ClientProject") ? "project-lock" : "user-lock")
      return []
    })
    userFindUnique.mockImplementation(async () => {
      order.push("user-read")
      return { id: "user-1", boundProjectId: "project-ai" }
    })
    projectFindUnique.mockImplementation(async () => {
      order.push("project-read")
      return { id: "project-ai", name: "AI商业顾问", status: "active", userId: "user-1", members: [{ userId: "user-1" }] }
    })
    create.mockImplementation(async () => {
      order.push("key-create")
      return { id: "key-1" }
    })

    const response = await POST(request({ name: "内容助手", clientType: "custom", projects: ["project-ai"] }))

    expect(response.status).toBe(201)
    expect(order).toEqual(["project-lock", "user-lock", "user-read", "project-read", "key-create"])
  })

  it("does not create a source grant when binding changed while waiting for the project lock", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1", boundProjectId: "project-target" })

    const response = await POST(request({
      name: "内容助手",
      clientType: "custom",
      projects: ["project-ai"],
    }))

    expect(response.status).toBe(409)
    expect(create).not.toHaveBeenCalled()
    expect(projectFindUnique).not.toHaveBeenCalled()
  })
})
