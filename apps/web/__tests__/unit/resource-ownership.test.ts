import { beforeEach, describe, expect, it, vi } from "vitest"

const { findFirst, userFindUnique, memberFindFirst } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  userFindUnique: vi.fn(),
  memberFindFirst: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    clientProject: { findFirst },
    projectMember: { findFirst: memberFindFirst },
  },
}))

import { ownsActiveProject } from "@/lib/resource-ownership"

describe("resource ownership", () => {
  beforeEach(() => {
    findFirst.mockReset()
    userFindUnique.mockReset()
    memberFindFirst.mockReset()
  })

  it("queries the project with owner and active status", async () => {
    findFirst.mockResolvedValueOnce({ id: "project-1" })
    userFindUnique.mockResolvedValueOnce({ boundProjectId: "project-1" })

    await expect(ownsActiveProject("user-1", "project-1")).resolves.toBe(true)
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { boundProjectId: true },
    })
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", userId: "user-1", status: "active" },
      select: { id: true },
    })
  })

  it("does not expose a project owned by another user", async () => {
    findFirst.mockResolvedValueOnce(null)
    userFindUnique.mockResolvedValueOnce({ boundProjectId: "project-other" })

    await expect(ownsActiveProject("user-2", "project-1")).resolves.toBe(false)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("rejects a second project even when it belongs to the same user", async () => {
    userFindUnique.mockResolvedValueOnce({ boundProjectId: "project-1" })

    await expect(ownsActiveProject("user-1", "project-2")).resolves.toBe(false)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("rejects when the account has no bound project yet", async () => {
    userFindUnique.mockResolvedValueOnce({ boundProjectId: null })

    await expect(ownsActiveProject("user-1", "project-1")).resolves.toBe(false)
    // 无绑定项目时不得退化为仅 userId 的归属查询
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("rejects when the bound project is not active", async () => {
    userFindUnique.mockResolvedValueOnce({ boundProjectId: "project-1" })
    // 绑定存在，但项目状态为 paused/archived → findFirst 命中 active 过滤后返回 null
    findFirst.mockResolvedValueOnce(null)

    await expect(ownsActiveProject("user-1", "project-1")).resolves.toBe(false)
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", userId: "user-1", status: "active" },
      select: { id: true },
    })
  })

  it("accepts a bound project where the account is an active member", async () => {
    userFindUnique.mockResolvedValueOnce({ boundProjectId: "project-1" })
    findFirst.mockResolvedValueOnce(null)
    memberFindFirst.mockResolvedValueOnce({ id: "membership-1" })

    await expect(ownsActiveProject("user-1", "project-1")).resolves.toBe(true)
    expect(memberFindFirst).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        userId: "user-1",
        project: { is: { status: "active" } },
      },
      select: { id: true },
    })
  })
})
