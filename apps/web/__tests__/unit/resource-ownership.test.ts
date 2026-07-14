import { beforeEach, describe, expect, it, vi } from "vitest"

const findFirst = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: { clientProject: { findFirst } },
}))

import { ownsActiveProject } from "@/lib/resource-ownership"

describe("resource ownership", () => {
  beforeEach(() => findFirst.mockReset())

  it("queries the project with owner and active status", async () => {
    findFirst.mockResolvedValueOnce({ id: "project-1" })

    await expect(ownsActiveProject("user-1", "project-1")).resolves.toBe(true)
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", userId: "user-1", status: "active" },
      select: { id: true },
    })
  })

  it("does not expose a project owned by another user", async () => {
    findFirst.mockResolvedValueOnce(null)

    await expect(ownsActiveProject("user-2", "project-1")).resolves.toBe(false)
  })
})
