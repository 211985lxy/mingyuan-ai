import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// withUserAuth must carry its implementation at hoist time: the route module
// calls withUserAuth(handler) at import, so the mock needs the wrapper ready
// before the route import resolves.
const { withUserAuth, resolveBoundProject, findFirst, update, updateMany, transaction } = vi.hoisted(() => ({
  withUserAuth: vi.fn(
    (handler: (request: NextRequest, context: { user: { id: string }; params?: Record<string, string> }) => Promise<Response>) =>
      async (request: NextRequest, segmentData: { params: Promise<Record<string, string>> }) => {
        const params = segmentData ? await segmentData.params : undefined
        return handler(request, { user: { id: "user-1" }, params })
      },
  ),
  resolveBoundProject: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ withUserAuth }))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code: string
    status: number
    constructor(code: string, message: string, status = 409) {
      super(message)
      this.code = code
      this.status = status
    }
  },
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    script: { findFirst, update, updateMany },
    $transaction: transaction,
  },
}))

import { PATCH } from "@/app/api/scripts/[id]/route"
import { AccountProjectContextError } from "@/lib/account-project-context"

function runHandler(id: string, body?: Record<string, unknown>) {
  const request = new NextRequest(`http://localhost/api/scripts/${id}`, {
    method: "PATCH",
    ...(body ? {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    } : {}),
  })
  return PATCH(request, { params: Promise.resolve({ id }) }) as Promise<Response>
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveBoundProject.mockResolvedValue({ id: "project-ai", name: "AI商业顾问", status: "active" })
  transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ script: { update, updateMany } }),
  )
})

describe("PATCH /api/scripts/[id] account-project scope", () => {
  const scriptRow = {
    id: "script-1",
    userId: "user-1",
    projectId: "project-ai",
    generationRunId: "run-1",
    content: "old content",
    status: "draft",
    selectedAt: null,
  }

  it("rejects an account without a usable bound project before any read", async () => {
    resolveBoundProject.mockRejectedValue(
      new AccountProjectContextError("ACCOUNT_PROJECT_SETUP_REQUIRED", "账号尚未绑定项目，请先完成项目设置", 409),
    )

    const response = await runHandler("script-1", { content: "new" })

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe("ACCOUNT_PROJECT_SETUP_REQUIRED")
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("treats a script of another/previous project (or null project) as not found", async () => {
    findFirst.mockResolvedValue(null)

    const response = await runHandler("script-cross-project", { content: "偷改他人项目稿子" })

    expect(response.status).toBe(404)
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "script-cross-project", projectId: "project-ai" },
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it("updates a script that belongs to the bound project, scoped by projectId", async () => {
    findFirst.mockResolvedValue(scriptRow)
    update.mockResolvedValue({ ...scriptRow, content: "新内容" })

    const response = await runHandler("script-1", { content: "新内容" })

    expect(response.status).toBe(200)
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "script-1", projectId: "project-ai" },
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: "script-1" },
      data: expect.objectContaining({ content: "新内容" }),
    })
    await expect(response.json()).resolves.toEqual({ data: { ...scriptRow, content: "新内容" } })
  })

  it("demotes other selected scripts of the same run inside the bound project only", async () => {
    findFirst.mockResolvedValue({ ...scriptRow, status: "candidate" })
    update.mockResolvedValue({ ...scriptRow, status: "selected", selectedAt: new Date("2026-01-01T00:00:00Z") })
    updateMany.mockResolvedValue({ count: 0 })

    const response = await runHandler("script-1", { status: "selected" })

    expect(response.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-ai",
        generationRunId: "run-1",
        status: "selected",
        NOT: { id: "script-1" },
      },
      data: { status: "candidate", selectedAt: null },
    })
  })

  it("rejects an invalid status with 400 before any database read", async () => {
    const response = await runHandler("script-1", { status: "invalid-status" })

    expect(response.status).toBe(400)
    expect(findFirst).not.toHaveBeenCalled()
  })
})
