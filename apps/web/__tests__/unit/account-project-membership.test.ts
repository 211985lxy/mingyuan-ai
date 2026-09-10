import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => {
  const user = { findUnique: vi.fn(), updateMany: vi.fn() }
  const clientProject = { findFirst: vi.fn(), findUnique: vi.fn() }
  const projectMember = { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() }
  const transaction = vi.fn()
  return { user, clientProject, projectMember, transaction }
})

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: m.user,
    clientProject: m.clientProject,
    projectMember: m.projectMember,
    $transaction: m.transaction,
  },
}))

import {
  bindAccountProject,
  resolveBoundProject,
} from "@/lib/account-project-context"
import { getProjectMemberUserIds } from "@/lib/project-membership"

describe("shared account project membership", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    m.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      user: m.user,
      clientProject: m.clientProject,
      projectMember: m.projectMember,
    }))
  })

  it("resolves an active project for an authorized member who is not its owner", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-insight" })
    m.clientProject.findFirst.mockResolvedValue(null)
    m.projectMember.findFirst.mockResolvedValue({
      project: { id: "project-insight", name: "明远 AI 商业洞察", status: "active" },
    })

    await expect(resolveBoundProject({ userId: "member-1" })).resolves.toEqual({
      id: "project-insight",
      name: "明远 AI 商业洞察",
      status: "active",
    })
    expect(m.projectMember.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "member-1",
        projectId: "project-insight",
        project: { is: { status: "active" } },
      },
      select: { project: { select: { id: true, name: true, status: true } } },
    })
  })

  it("records a member binding when an administrator selects another owner's active project", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: null })
    m.clientProject.findUnique.mockResolvedValue({
      id: "project-insight",
      userId: "owner-1",
      name: "明远 AI 商业洞察",
      status: "active",
    })
    m.user.updateMany.mockResolvedValue({ count: 1 })

    await expect(bindAccountProject({ userId: "member-1", projectId: "project-insight" }))
      .resolves.toMatchObject({ id: "project-insight" })
    expect(m.projectMember.upsert).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: "project-insight", userId: "member-1" } },
      create: { projectId: "project-insight", userId: "member-1", role: "member" },
      update: {},
    })
  })

  it("returns the owner and every member exactly once for project-level operations", async () => {
    m.clientProject.findUnique.mockResolvedValue({
      userId: "owner-1",
      members: [{ userId: "owner-1" }, { userId: "member-1" }, { userId: "member-2" }],
    })

    await expect(getProjectMemberUserIds("project-insight")).resolves.toEqual([
      "owner-1",
      "member-1",
      "member-2",
    ])
  })
})
