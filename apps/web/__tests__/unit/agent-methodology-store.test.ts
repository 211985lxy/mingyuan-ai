import { afterEach, describe, expect, it, vi } from "vitest"

// 方法论加载层（DB 优先 + 文件兜底）是 5 个智能体共用的关键路径。
// 锁定其在 DB 不可用、返回空、返回正常三种情形下的回退行为，防止回归。
const { findUniqueMock } = vi.hoisted(() => ({ findUniqueMock: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMethodology: { findUnique: findUniqueMock },
  },
}))

import {
  getMethodologyBlock,
  invalidateMethodologyCache,
  METHODOLOGY_META,
} from "@/lib/agent-methodology-store"

afterEach(() => {
  // 重置缓存与 mock，避免用例间互相干扰
  invalidateMethodologyCache()
  findUniqueMock.mockReset()
})

describe("agent-methodology-store getMethodologyBlock", () => {
  it("DB 不可用时回退到文件兜底，仍能拼出带块标题的内容", async () => {
    findUniqueMock.mockRejectedValueOnce(new Error("db down"))

    const block = await getMethodologyBlock("ip_copywriting")

    // 文件兜底命中 mingyuan/docs/ip-copywriting-methodology-core.md
    expect(block).toContain(METHODOLOGY_META.ip_copywriting.blockTitle)
    expect(block).toContain("流量型视频")
  })

  it("DB 返回空内容时也回退到文件兜底", async () => {
    findUniqueMock.mockResolvedValueOnce({ content: "   ", title: "x" })

    const block = await getMethodologyBlock("business_diagnosis")

    expect(block).toContain(METHODOLOGY_META.business_diagnosis.blockTitle)
    expect(block).toContain("信息校准")
  })

  it("DB 命中有效内容时优先使用 DB 内容", async () => {
    const dbContent = "这是后台自定义的方法论内容"
    findUniqueMock.mockResolvedValueOnce({ content: dbContent, title: "x" })

    const block = await getMethodologyBlock("event_storytelling")

    expect(block).toContain(dbContent)
  })
})
