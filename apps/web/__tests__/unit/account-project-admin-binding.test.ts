import { beforeEach, describe, expect, it, vi } from "vitest"

const { transaction, userFindUnique, projectFindUnique, userUpdateMany } = vi.hoisted(() => ({
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  userUpdateMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
  },
}))

import {
  bindAccountProject,
  AccountProjectContextError,
} from "@/lib/account-project-context"

describe("admin account project binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      user: { findUnique: userFindUnique, updateMany: userUpdateMany },
      clientProject: { findUnique: projectFindUnique },
    }))
  })

  it("binds an owned active project to an unbound account", async () => {
    userFindUnique.mockResolvedValue({ boundProjectId: null })
    projectFindUnique.mockResolvedValue({ id: "project-ai", userId: "user-1", name: "AI商业顾问", status: "active" })
    userUpdateMany.mockResolvedValue({ count: 1 })

    await expect(bindAccountProject({ userId: "user-1", projectId: "project-ai" })).resolves.toEqual({
      id: "project-ai",
      userId: "user-1",
      name: "AI商业顾问",
      status: "active",
    })
    expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1", boundProjectId: null },
      data: expect.objectContaining({
        boundProjectId: "project-ai",
        projectBindingSource: "admin_review",
      }),
    }))
  })

  it("rejects binding a project owned by another account", async () => {
    userFindUnique.mockResolvedValue({ boundProjectId: null })
    projectFindUnique.mockResolvedValue({ id: "project-other", userId: "user-2", name: "他人项目", status: "active" })

    await expect(bindAccountProject({ userId: "user-1", projectId: "project-other" }))
      .rejects.toMatchObject({ code: "PROJECT_CONTEXT_MISMATCH", status: 409 })
    expect(userUpdateMany).not.toHaveBeenCalled()
  })

  it("does not replace an already bound project", async () => {
    userFindUnique.mockResolvedValue({ boundProjectId: "project-existing" })

    await expect(bindAccountProject({ userId: "user-1", projectId: "project-new" }))
      .rejects.toMatchObject({ code: "ACCOUNT_ALREADY_BOUND", status: 409 })
    expect(projectFindUnique).not.toHaveBeenCalled()
  })

  it("keeps the domain error available to the admin route", () => {
    expect(new AccountProjectContextError("PROJECT_CONTEXT_MISMATCH", "项目不属于账号")).toMatchObject({
      code: "PROJECT_CONTEXT_MISMATCH",
      status: 409,
    })
  })
})
