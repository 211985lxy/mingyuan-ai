import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  transaction,
  userFindUnique,
  projectFindUnique,
  userUpdateMany,
  projectMemberUpsert,
  lockClientProjects,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  userUpdateMany: vi.fn(),
  projectMemberUpsert: vi.fn(),
  lockClientProjects: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
  },
}))

vi.mock("@/features/projects/services/project-row-lock", () => ({
  lockClientProjects,
}))

import {
  bindAccountProject,
  AccountProjectContextError,
} from "@/lib/account-project-context"

describe("admin account project binding", () => {
  const callOrder: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    callOrder.length = 0
    lockClientProjects.mockImplementation(async () => {
      callOrder.push("lockClientProjects")
    })
    projectFindUnique.mockImplementation(async () => {
      callOrder.push("clientProject.findUnique")
      return { id: "project-ai", userId: "user-1", name: "AI商业顾问", status: "active" }
    })
    userFindUnique.mockImplementation(async () => {
      callOrder.push("user.findUnique")
      return { boundProjectId: null }
    })
    userUpdateMany.mockImplementation(async () => {
      callOrder.push("user.updateMany")
      return { count: 1 }
    })
    projectMemberUpsert.mockImplementation(async () => {
      callOrder.push("projectMember.upsert")
      return {}
    })
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      user: { findUnique: userFindUnique, updateMany: userUpdateMany },
      clientProject: { findUnique: projectFindUnique },
      projectMember: { upsert: projectMemberUpsert },
    }))
  })

  it("binds an owned active project to an unbound account", async () => {
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

  it("locks the project before reading status or updating the user", async () => {
    await bindAccountProject({ userId: "user-1", projectId: "project-ai" })

    expect(lockClientProjects).toHaveBeenCalledWith(expect.anything(), ["project-ai"])
    expect(callOrder).toEqual([
      "lockClientProjects",
      "clientProject.findUnique",
      "user.findUnique",
      "user.updateMany",
      "projectMember.upsert",
    ])
  })

  it("rejects bind when the project is archived while waiting for the lock", async () => {
    projectFindUnique.mockImplementation(async () => {
      callOrder.push("clientProject.findUnique")
      return { id: "project-ai", userId: "user-1", name: "AI商业顾问", status: "archived" }
    })

    await expect(bindAccountProject({ userId: "user-1", projectId: "project-ai" }))
      .rejects.toMatchObject({ code: "BOUND_PROJECT_UNAVAILABLE", status: 409 })
    expect(callOrder[0]).toBe("lockClientProjects")
    expect(userUpdateMany).not.toHaveBeenCalled()
    expect(projectMemberUpsert).not.toHaveBeenCalled()
  })

  it("allows binding an active project owned by another account as a member", async () => {
    projectFindUnique.mockImplementation(async () => {
      callOrder.push("clientProject.findUnique")
      return { id: "project-other", userId: "user-2", name: "他人项目", status: "active" }
    })

    await expect(bindAccountProject({ userId: "user-1", projectId: "project-other" }))
      .resolves.toMatchObject({ id: "project-other" })
    expect(projectMemberUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { projectId: "project-other", userId: "user-1", role: "member" },
    }))
  })

  it("does not replace an already bound project", async () => {
    userFindUnique.mockImplementation(async () => {
      callOrder.push("user.findUnique")
      return { boundProjectId: "project-existing" }
    })

    await expect(bindAccountProject({ userId: "user-1", projectId: "project-new" }))
      .rejects.toMatchObject({ code: "ACCOUNT_ALREADY_BOUND", status: 409 })
    expect(lockClientProjects).toHaveBeenCalled()
    expect(userUpdateMany).not.toHaveBeenCalled()
  })

  it("keeps the domain error available to the admin route", () => {
    expect(new AccountProjectContextError("PROJECT_CONTEXT_MISMATCH", "项目不属于账号")).toMatchObject({
      code: "PROJECT_CONTEXT_MISMATCH",
      status: 409,
    })
  })
})
