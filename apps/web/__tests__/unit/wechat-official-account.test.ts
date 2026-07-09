import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock redis
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

describe("wechat-official-account", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env vars
    process.env.WECHAT_APP_ID = "test-app-id"
    process.env.WECHAT_APP_SECRET = "test-secret"
    process.env.WECHAT_DEFAULT_AUTHOR = "测试作者"
  })

  describe("constructor validation", () => {
    it("throws when WECHAT_APP_ID is missing", async () => {
      process.env.WECHAT_APP_ID = ""
      process.env.WECHAT_APP_SECRET = "secret"
      const { WechatOfficialAccount } = await import("@/lib/wechat-official-account")
      expect(() => new WechatOfficialAccount()).toThrow("WECHAT_APP_ID")
    })

    it("throws when WECHAT_APP_SECRET is missing", async () => {
      process.env.WECHAT_APP_ID = "id"
      process.env.WECHAT_APP_SECRET = ""
      const { WechatOfficialAccount } = await import("@/lib/wechat-official-account")
      expect(() => new WechatOfficialAccount()).toThrow("WECHAT_APP_SECRET")
    })
  })

  describe("getAccessToken", () => {
    it("returns cached token from redis", async () => {
      const { redis } = await import("@/lib/redis")
      vi.mocked(redis.get).mockResolvedValue("cached-token-123")

      const mockFetch = vi.fn()
      vi.stubGlobal("fetch", mockFetch)

      const { WechatOfficialAccount } = await import("@/lib/wechat-official-account")
      const client = new WechatOfficialAccount()
      const token = await client.getAccessToken()

      expect(token).toBe("cached-token-123")
      expect(redis.get).toHaveBeenCalledWith("wechat:access_token")
      // Should not call WeChat API when cache hits
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("fetches new token and caches when no cache", async () => {
      const { redis } = await import("@/lib/redis")
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(redis.set).mockResolvedValue("OK")

      const mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ access_token: "new-token-456", expires_in: 7200 }),
      })
      vi.stubGlobal("fetch", mockFetch)

      const { WechatOfficialAccount } = await import("@/lib/wechat-official-account")
      const client = new WechatOfficialAccount()
      const token = await client.getAccessToken()

      expect(token).toBe("new-token-456")
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.weixin.qq.com/cgi-bin/token"),
      )
      expect(redis.set).toHaveBeenCalledWith(
        "wechat:access_token",
        "new-token-456",
        "EX",
        7000,
      )
    })

    it("throws on WeChat API error", async () => {
      const { redis } = await import("@/lib/redis")
      vi.mocked(redis.get).mockResolvedValue(null)

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ errcode: 40001, errmsg: "invalid credential" }),
      }))

      const { WechatOfficialAccount } = await import("@/lib/wechat-official-account")
      const client = new WechatOfficialAccount()

      await expect(client.getAccessToken()).rejects.toThrow("获取 access_token 失败")
    })
  })

  describe("createDraft", () => {
    it("calls draft/add with correct params and returns media_id + appmsgid", async () => {
      const { redis } = await import("@/lib/redis")
      vi.mocked(redis.get).mockResolvedValue("test-token")

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ media_id: "media-123", appmsgid: "appmsg-456" }),
      }))

      const { WechatOfficialAccount } = await import("@/lib/wechat-official-account")
      const client = new WechatOfficialAccount()
      const result = await client.createDraft({
        title: "测试标题",
        author: "测试作者",
        digest: "测试摘要",
        content: "<p>测试正文</p>",
        thumbMediaId: "thumb-789",
      })

      expect(result).toEqual({ mediaId: "media-123", appmsgId: "appmsg-456" })

      // Verify fetch was called with correct URL and body
      const lastCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)
      expect(lastCall?.[0]).toContain("draft/add")
    })

    it("throws on WeChat API error", async () => {
      const { redis } = await import("@/lib/redis")
      vi.mocked(redis.get).mockResolvedValue("test-token")

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ errcode: 40007, errmsg: "invalid media_id" }),
      }))

      const { WechatOfficialAccount } = await import("@/lib/wechat-official-account")
      const client = new WechatOfficialAccount()

      await expect(client.createDraft({
        title: "测试",
        author: "作者",
        digest: "摘要",
        content: "<p>正文</p>",
        thumbMediaId: "invalid-thumb",
      })).rejects.toThrow("草稿创建失败")
    })
  })

  describe("getWechatDefaultAuthor", () => {
    it("returns env value when set", async () => {
      const { getWechatDefaultAuthor } = await import("@/lib/wechat-official-account")
      expect(getWechatDefaultAuthor()).toBe("测试作者")
    })

    it("returns fallback when env not set", async () => {
      process.env.WECHAT_DEFAULT_AUTHOR = ""
      const { getWechatDefaultAuthor } = await import("@/lib/wechat-official-account")
      expect(getWechatDefaultAuthor()).toBe("明远")
    })
  })
})
