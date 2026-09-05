import { beforeEach, describe, expect, it, vi } from "vitest"

const { findFirst, update, refreshDouyinAccessToken, fetchDouyinRecentVideos } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(async () => ({})),
  refreshDouyinAccessToken: vi.fn(),
  fetchDouyinRecentVideos: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { douyinAccountBinding: { findFirst, update } },
}))
vi.mock("@/lib/douyin-openapi", () => ({ refreshDouyinAccessToken, fetchDouyinRecentVideos }))

import { loadOwnAccountPlatformContext } from "@/lib/aim/own-account-platform-context"

function binding(overrides: Record<string, unknown> = {}) {
  return {
    openId: "ou_test_1",
    accessToken: "at",
    refreshToken: "rt",
    scope: "video.list",
    accessExpiresAt: new Date(Date.now() + 3600_000), // 未过期
    profileSnapshot: { nickname: "测试号" },
    ...overrides,
  }
}

function video(overrides: Record<string, unknown> = {}) {
  return {
    itemId: "v1",
    title: "测试视频标题",
    createTime: 1757000000,
    statistics: { playCount: 1000, diggCount: 50, commentCount: 5, collectCount: 20, shareCount: 3 },
    ...overrides,
  }
}

describe("loadOwnAccountPlatformContext（方案 A：自有账号官方 API）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirst.mockResolvedValue(null)
  })

  it("未绑定：引导文案，不出数据", async () => {
    const r = await loadOwnAccountPlatformContext({ userId: "u1" })
    expect(r.hasData).toBe(false)
    expect(r.block).toContain("未绑定抖音账号")
    expect(fetchDouyinRecentVideos).not.toHaveBeenCalled()
  })

  it("已绑定且有作品：注入块含账号昵称、播放合计、逐条指标", async () => {
    findFirst.mockResolvedValue(binding())
    fetchDouyinRecentVideos.mockResolvedValue([video(), video({ itemId: "v2", title: "第二条" })])
    const r = await loadOwnAccountPlatformContext({ userId: "u1" })
    expect(r.hasData).toBe(true)
    expect(r.block).toContain("自有账号平台表现")
    expect(r.block).toContain("测试号")
    expect(r.block).toContain("官方 API")
    expect(r.block).toContain("播放合计 2,000")
    expect(r.block).toContain("播放 1,000")
    expect(r.block).toContain("近 2 条作品")
  })

  it("token 过期：先刷新并回写，再正常拉数据", async () => {
    findFirst.mockResolvedValue(binding({ accessExpiresAt: new Date(Date.now() - 1000) }))
    refreshDouyinAccessToken.mockResolvedValue({ accessToken: "at2", refreshToken: "rt2", expiresIn: 7200, openId: "ou_test_1", scope: "video.list" })
    fetchDouyinRecentVideos.mockResolvedValue([video()])
    const r = await loadOwnAccountPlatformContext({ userId: "u1" })
    expect(refreshDouyinAccessToken).toHaveBeenCalledWith("rt")
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_openId: { userId: "u1", openId: "ou_test_1" } },
    }))
    expect(r.hasData).toBe(true)
    expect(fetchDouyinRecentVideos).toHaveBeenCalled()
  })

  it("token 过期且刷新失败：显式 expired 文案，不拉数据", async () => {
    findFirst.mockResolvedValue(binding({ accessExpiresAt: new Date(Date.now() - 1000) }))
    refreshDouyinAccessToken.mockResolvedValue(null)
    const r = await loadOwnAccountPlatformContext({ userId: "u1" })
    expect(r.hasData).toBe(false)
    expect(r.block).toContain("授权已过期")
    expect(fetchDouyinRecentVideos).not.toHaveBeenCalled()
  })

  it("API 无作品：说明而非编造", async () => {
    findFirst.mockResolvedValue(binding())
    fetchDouyinRecentVideos.mockResolvedValue([])
    const r = await loadOwnAccountPlatformContext({ userId: "u1" })
    expect(r.hasData).toBe(false)
    expect(r.block).toContain("未返回作品")
  })

  it("API 抛错：失败可见，不出估算值", async () => {
    findFirst.mockResolvedValue(binding())
    fetchDouyinRecentVideos.mockRejectedValue(new Error("接口超时"))
    const r = await loadOwnAccountPlatformContext({ userId: "u1" })
    expect(r.hasData).toBe(false)
    expect(r.block).toContain("读取抖音数据失败")
    expect(r.block).toContain("接口超时")
    expect(r.block).toContain("不出估算值")
  })

  it("10 条以上截断展示并注明剩余条数", async () => {
    findFirst.mockResolvedValue(binding())
    fetchDouyinRecentVideos.mockResolvedValue(Array.from({ length: 15 }, (_, i) => video({ itemId: `v${i}`, title: `视频${i}` })))
    const r = await loadOwnAccountPlatformContext({ userId: "u1" })
    expect(r.block).toContain("其余 5 条略")
  })
})
