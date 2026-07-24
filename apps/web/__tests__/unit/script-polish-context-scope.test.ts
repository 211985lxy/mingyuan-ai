import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeEntry: { findMany: mocks.findMany },
  },
}))

const { loadProjectKnowledge } = await import("@/lib/aim/services/script-polish-context")

describe("script polish knowledge scope", () => {
  beforeEach(() => {
    mocks.findMany.mockReset()
    mocks.findMany.mockResolvedValue([])
  })

  it("loads only the selected customer's project knowledge", async () => {
    await loadProjectKnowledge("user-1", "project-1")

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: "user-1",
        status: "active",
        projectId: "project-1",
      },
    }))
  })

  it("does not load knowledge from every customer when no project is selected", async () => {
    await loadProjectKnowledge("user-1")

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: "user-1",
        status: "active",
        projectId: null,
      },
    }))
  })
})
