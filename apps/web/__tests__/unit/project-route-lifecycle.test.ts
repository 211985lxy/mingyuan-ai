import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  permanentlyDelete: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: vi.fn().mockResolvedValue({ id: "u1" }),
  authErrorResponse: vi.fn().mockReturnValue(null),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { clientProject: { findFirst: mocks.findFirst, update: mocks.update } },
}))
vi.mock("@/features/projects/services/project-lifecycle", () => ({
  permanentlyDeleteOwnedProject: mocks.permanentlyDelete,
}))

import { DELETE } from "@/app/api/projects/[id]/route"

describe("project DELETE lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirst.mockResolvedValue({ id: "p1", name: "客户项目" })
    mocks.update.mockResolvedValue({ id: "p1", status: "archived" })
    mocks.permanentlyDelete.mockResolvedValue({ generations: 2 })
  })

  it("keeps the existing DELETE behavior as archive by default", async () => {
    const response = await DELETE(new Request("https://example.com/api/projects/p1") as never, {
      params: Promise.resolve({ id: "p1" }),
    })

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "archived" } }))
    expect(mocks.permanentlyDelete).not.toHaveBeenCalled()
  })

  it("requires the exact project name before permanent deletion", async () => {
    const response = await DELETE(new Request("https://example.com/api/projects/p1?permanent=true&confirm=wrong") as never, {
      params: Promise.resolve({ id: "p1" }),
    })

    expect(response.status).toBe(400)
    expect(mocks.permanentlyDelete).not.toHaveBeenCalled()
  })

  it("permanently deletes only after explicit confirmation", async () => {
    const response = await DELETE(new Request("https://example.com/api/projects/p1?permanent=true&confirm=%E5%AE%A2%E6%88%B7%E9%A1%B9%E7%9B%AE") as never, {
      params: Promise.resolve({ id: "p1" }),
    })

    expect(response.status).toBe(200)
    expect(mocks.permanentlyDelete).toHaveBeenCalledWith("u1", "p1")
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
