import { beforeEach, describe, expect, it, vi } from "vitest"

const { createClientProject } = vi.hoisted(() => ({
  createClientProject: vi.fn(),
}))

vi.mock("@/lib/api/client", () => ({ createClientProject }))

import { ensureDefaultAccountProject } from "@/features/knowledge/ensure-default-account-project"

describe("ensureDefaultAccountProject", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("已有 active 项目时直接复用，不新建", async () => {
    const existing = {
      id: "proj_1",
      name: "已有账户",
      status: "active",
    }
    const result = await ensureDefaultAccountProject([existing as never])
    expect(result).toEqual({ project: existing, created: false })
    expect(createClientProject).not.toHaveBeenCalled()
  })

  it("无项目时自动创建「我的账户」", async () => {
    const created = { id: "proj_new", name: "我的账户", status: "active" }
    createClientProject.mockResolvedValueOnce(created)
    const result = await ensureDefaultAccountProject([])
    expect(createClientProject).toHaveBeenCalledWith({ name: "我的账户" })
    expect(result).toEqual({ project: created, created: true })
  })
})
