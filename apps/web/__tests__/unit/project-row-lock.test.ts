import { describe, expect, it, vi } from "vitest"

import { lockClientProjects, lockUsers } from "@/features/projects/services/project-row-lock"

describe("lockClientProjects", () => {
  it("dedupes, sorts, and locks with one parameterized statement", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([])
    const tx = { $queryRawUnsafe: queryRawUnsafe }

    await lockClientProjects(tx as never, ["project-z", "project-a", "project-z"])

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1)
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      "SELECT `id` FROM `ClientProject` WHERE `id` IN (?, ?) ORDER BY `id` FOR UPDATE",
      "project-a",
      "project-z",
    )
    const sql = String(queryRawUnsafe.mock.calls[0]?.[0] ?? "")
    expect(sql).not.toContain("project-a")
    expect(sql).not.toContain("project-z")
  })

  it("is a no-op for an empty id list", async () => {
    const queryRawUnsafe = vi.fn()

    await lockClientProjects({ $queryRawUnsafe: queryRawUnsafe } as never, [])

    expect(queryRawUnsafe).not.toHaveBeenCalled()
  })
})

describe("lockUsers", () => {
  it("locks every participant by stable user id including unbound accounts", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([])

    await lockUsers({ $queryRawUnsafe: queryRawUnsafe } as never, ["user-z", "user-a", "user-z"])

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      "SELECT `id` FROM `User` WHERE `id` IN (?, ?) ORDER BY `id` FOR UPDATE",
      "user-a",
      "user-z",
    )
  })
})
