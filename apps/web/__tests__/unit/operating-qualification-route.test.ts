import { beforeEach, describe, expect, it, vi } from "vitest"

const { getOperatingQualification } = vi.hoisted(() => ({
  getOperatingQualification: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}))
vi.mock("@/lib/aim/operating-qualification-store", () => ({
  getOperatingQualification,
}))

import { GET } from "@/app/api/admin/aim/operating-qualification/route"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("operating qualification API", () => {
  it("返回只读资格结果", async () => {
    getOperatingQualification.mockResolvedValue({
      qualified: false,
      criteria: [{ id: "sample", passed: false }],
    })
    const response = await GET({} as never, {} as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ qualified: false })
  })

  it("证据读取异常时 fail closed", async () => {
    getOperatingQualification.mockRejectedValue(new Error("database unavailable"))
    const response = await GET({} as never, {} as never)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      qualified: false,
      error: "database unavailable",
    })
  })
})
