import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  permanentlyDelete: vi.fn(),
  resolveBoundProject: vi.fn(async () => ({ id: "p1", name: "客户项目", status: "active" })),
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
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject: mocks.resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
}))

import { DELETE } from "@/app/api/projects/[id]/route"

describe("project DELETE lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirst.mockResolvedValue({ id: "p1", name: "客户项目" })
    mocks.update.mockResolvedValue({ id: "p1", status: "archived" })
    mocks.permanentlyDelete.mockResolvedValue({ generations: 2 })
  })

  it("does not archive the account-bound project", async () => {
    const response = await DELETE(new Request("https://example.com/api/projects/p1") as never, {
      params: Promise.resolve({ id: "p1" }),
    })

    expect(response.status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.permanentlyDelete).not.toHaveBeenCalled()
  })

  it("does not allow permanent deletion of the account-bound project", async () => {
    const response = await DELETE(new Request("https://example.com/api/projects/p1?permanent=true&confirm=wrong") as never, {
      params: Promise.resolve({ id: "p1" }),
    })

    expect(response.status).toBe(409)
    expect(mocks.permanentlyDelete).not.toHaveBeenCalled()
  })

  it("keeps the binding lock even with permanent-delete confirmation", async () => {
    const response = await DELETE(new Request("https://example.com/api/projects/p1?permanent=true&confirm=%E5%AE%A2%E6%88%B7%E9%A1%B9%E7%9B%AE") as never, {
      params: Promise.resolve({ id: "p1" }),
    })

    expect(response.status).toBe(409)
    expect(mocks.permanentlyDelete).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("does not let an account archive its only bound project", async () => {
    const response = await DELETE(new Request("https://example.com/api/projects/p1") as never, {
      params: Promise.resolve({ id: "p1" }),
    })

    // This expectation is intentionally red until the account binding guard is wired.
    expect(response.status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
