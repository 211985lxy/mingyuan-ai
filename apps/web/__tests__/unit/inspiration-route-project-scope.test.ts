import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  projectFindFirst: vi.fn(),
  inspirationFindMany: vi.fn(),
  inspirationCreate: vi.fn(),
  resolveBoundProject: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
  authErrorResponse: () => null,
}))
vi.mock("@/lib/background-task-runtime", () => ({ areBackgroundTasksEnabled: () => true }))
vi.mock("@/lib/background-tasks", () => ({ enqueueBackgroundTask: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientProject: { findFirst: mocks.projectFindFirst },
    inspiration: { findMany: mocks.inspirationFindMany },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      inspiration: { create: mocks.inspirationCreate },
    }),
  },
}))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject: mocks.resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
}))

import { GET, POST } from "@/app/api/inspiration/route"

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/inspiration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("inspiration project scope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateRequest.mockResolvedValue({ id: "user-1" })
    mocks.resolveBoundProject.mockResolvedValue({ id: "project-1", name: "项目一", status: "active" })
    mocks.inspirationFindMany.mockResolvedValue([])
    mocks.inspirationCreate.mockImplementation(async ({ data }) => ({ id: "inspiration-1", ...data }))
  })

  it("writes a verified optional projectId", async () => {
    const response = await POST(post({ content: "A customer question", projectId: "project-1", autoProcess: false }))
    expect(response.status).toBe(201)
    expect(mocks.resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: "project-1" })
    expect(mocks.inspirationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: "project-1" }),
    })
  })

  it("returns 404 for another user's project", async () => {
    mocks.resolveBoundProject.mockRejectedValue(Object.assign(new Error("当前账号只能使用已绑定的项目"), {
      code: "PROJECT_CONTEXT_MISMATCH",
      status: 409,
    }))
    const response = await POST(post({ content: "Private", projectId: "project-2", autoProcess: false }))
    expect(response.status).toBe(409)
    expect(mocks.inspirationCreate).not.toHaveBeenCalled()
  })

  it("uses the account-bound project when projectId is omitted", async () => {
    const response = await POST(post({ content: "One-off", autoProcess: false }))
    expect(response.status).toBe(201)
    expect(mocks.resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: undefined })
    expect(mocks.inspirationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: "project-1" }),
    })
  })

  it("filters the list by projectId", async () => {
    const response = await GET(new NextRequest("http://localhost/api/inspiration?projectId=project-1"))
    expect(response.status).toBe(200)
    expect(mocks.resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: "project-1" })
    expect(mocks.inspirationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", projectId: "project-1" }),
    }))
  })
})
