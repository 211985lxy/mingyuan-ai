import { beforeEach, describe, expect, it, vi } from "vitest"

const findMany = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: { aimMemory: { findMany } },
}))

import { retrieveAimMemory } from "@/lib/aim-memory"

describe("shared project AIM memory", () => {
  beforeEach(() => {
    findMany.mockReset()
    findMany.mockResolvedValue([])
  })

  it("retrieves active project memory from all authorized members", async () => {
    await retrieveAimMemory({ userId: "member-1", projectId: "project-insight" })

    const where = findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ projectId: "project-insight", status: "active" })
    expect(where).not.toHaveProperty("userId")
  })

  it("keeps unbound quick-mode memory personal", async () => {
    await retrieveAimMemory({ userId: "member-1", projectId: null })

    expect(findMany.mock.calls[0][0].where).toMatchObject({
      userId: "member-1",
      projectId: null,
      status: "active",
    })
  })
})
