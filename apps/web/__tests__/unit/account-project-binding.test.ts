import { beforeEach, describe, expect, it, vi } from "vitest"

const { transaction, userFindUnique, projectCount, projectCreate, userUpdateMany } = vi.hoisted(() => ({
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  projectCount: vi.fn(),
  projectCreate: vi.fn(),
  userUpdateMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
    user: { findUnique: userFindUnique, updateMany: userUpdateMany },
    clientProject: { count: projectCount, create: projectCreate },
  },
}))

import {
  createInitialAccountProject,
  AccountProjectContextError,
} from "@/lib/account-project-context"

describe("initial account project binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      user: { findUnique: userFindUnique, updateMany: userUpdateMany },
      clientProject: { count: projectCount, create: projectCreate },
    }))
  })

  it("creates and atomically binds the first project to the account", async () => {
    userFindUnique.mockResolvedValue({ boundProjectId: null })
    projectCount.mockResolvedValue(0)
    const project = { id: "project-ai", name: "AI商业顾问", status: "active" }
    projectCreate.mockResolvedValue(project)
    userUpdateMany.mockResolvedValue({ count: 1 })

    await expect(createInitialAccountProject("user-1", { name: project.name })).resolves.toEqual(project)
    expect(projectCreate).toHaveBeenCalledWith({ data: { userId: "user-1", name: project.name } })
    expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1", boundProjectId: null },
      data: expect.objectContaining({
        boundProjectId: project.id,
        projectBindingSource: "self_created",
      }),
    }))
  })

  it("does not create a second project for a bound account", async () => {
    userFindUnique.mockResolvedValue({ boundProjectId: "project-existing" })

    await expect(createInitialAccountProject("user-1", { name: "另一个项目" }))
      .rejects.toMatchObject({ code: "ACCOUNT_ALREADY_BOUND", status: 409 })
    expect(projectCreate).not.toHaveBeenCalled()
  })

  it("sends existing unbound projects to admin review", async () => {
    userFindUnique.mockResolvedValue({ boundProjectId: null })
    projectCount.mockResolvedValue(1)

    await expect(createInitialAccountProject("user-1", { name: "待审核项目" }))
      .rejects.toMatchObject({ code: "ACCOUNT_PROJECT_REVIEW_REQUIRED", status: 409 })
    expect(projectCreate).not.toHaveBeenCalled()
  })

  it("keeps the error type stable for callers", () => {
    expect(new AccountProjectContextError("ACCOUNT_ALREADY_BOUND", "已绑定")).toMatchObject({
      code: "ACCOUNT_ALREADY_BOUND",
      status: 409,
    })
  })
})
