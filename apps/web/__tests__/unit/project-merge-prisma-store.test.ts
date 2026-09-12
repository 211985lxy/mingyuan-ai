import { describe, expect, it, vi } from "vitest"

import { lockAndInspectProjectMerge } from "@/features/projects/services/project-merge-prisma-store"

describe("lockAndInspectProjectMerge", () => {
  it("locks projects then every discovered participant user before rebuilding the snapshot", async () => {
    const order: string[] = []
    let projectRead = 0
    const project = (id: "source" | "target") => ({
      id,
      userId: `${id}-owner`,
      status: "active",
      members: [{ userId: `${id}-unbound-member` }],
      boundAccounts: [{ id: `${id}-bound` }],
    })
    const tx = {
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        if (sql.includes("ClientProject")) order.push("projects-lock")
        else if (sql.includes("ProjectMember")) order.push("members-lock")
        else if (sql.includes("FROM `User`")) order.push("users-lock")
        return []
      }),
      $queryRaw: vi.fn(async () => []),
      clientProject: {
        findUnique: vi.fn(async ({ where }: { where: { id: "source" | "target" } }) => {
          order.push(`project-read-${++projectRead}`)
          return project(where.id)
        }),
      },
      user: {
        findMany: vi.fn(async () => [
          { id: "source-owner", boundProjectId: "source" },
          { id: "source-unbound-member", boundProjectId: null },
          { id: "source-bound", boundProjectId: "source" },
          { id: "target-owner", boundProjectId: "target" },
          { id: "target-unbound-member", boundProjectId: null },
          { id: "target-bound", boundProjectId: "target" },
        ]),
      },
      adminUser: {
        findUnique: vi.fn(async () => ({ id: "admin", isActive: true, role: "admin" })),
      },
      agentInvocation: { count: vi.fn(async () => 0) },
      aimExecutionTrace: { count: vi.fn(async () => 0) },
    }

    const snapshot = await lockAndInspectProjectMerge(tx as never, {
      sourceProjectId: "source",
      targetProjectId: "target",
      adminUserId: "admin",
    })

    expect(order.slice(0, 6)).toEqual([
      "projects-lock",
      "project-read-1",
      "project-read-2",
      "members-lock",
      "users-lock",
      "project-read-3",
    ])
    const userLock = tx.$queryRawUnsafe.mock.calls.find(([sql]) => String(sql).includes("FROM `User`"))
    expect(userLock?.slice(1)).toEqual([
      "source-bound",
      "source-owner",
      "source-unbound-member",
      "target-bound",
      "target-owner",
      "target-unbound-member",
    ])
    expect(snapshot.participants).toContainEqual({
      userId: "source-unbound-member",
      boundProjectId: null,
    })
  })
})
