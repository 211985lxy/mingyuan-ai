import { beforeEach, describe, expect, it, vi } from "vitest"

// 服务端守卫与安全指标替身化：单测不连网、不落日志。
// 短链探测现统一走 ssrf-guard.server#probeRedirect（解析+钉 IP+跳转校验），
// 不再直接 fetch，故此处打桩守卫而非全局 fetch。
vi.mock("@/lib/ssrf-guard.server", () => {
  class SsrfBlockedError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "SsrfBlockedError"
    }
  }
  return { probeRedirect: vi.fn(), SsrfBlockedError }
})
vi.mock("@/lib/security-metrics", () => ({ incrementSecurityMetric: vi.fn() }))

import {
  extractDouyinAwemeId,
  isDouyinShortUrl,
  normalizeDouyinAwemeId,
} from "@/lib/douyin-short-url"
import { resolveDouyinAwemeId, resolveDouyinShortUrl } from "@/lib/douyin-short-url-resolver"
import { probeRedirect, SsrfBlockedError } from "@/lib/ssrf-guard.server"
import { incrementSecurityMetric } from "@/lib/security-metrics"

const mockedProbe = vi.mocked(probeRedirect)
const mockedMetric = vi.mocked(incrementSecurityMetric)

const LONG_URL = "https://www.douyin.com/video/7123456789012345678"
const SHORT_URL = "https://v.douyin.com/AbCdEf/"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("抖音短链解析", () => {
  it("长链直接抽出 aweme_id", () => {
    expect(extractDouyinAwemeId("https://www.douyin.com/video/7123456789012345678")).toBe("7123456789012345678")
    expect(extractDouyinAwemeId("https://www.iesdouyin.com/share/video/7123456789012345678/")).toBe("7123456789012345678")
    expect(extractDouyinAwemeId("https://v.douyin.com/AbCdEf/")).toBeNull()
  })

  it("normalize 接受纯数字作品 ID 和 modal_id", () => {
    expect(normalizeDouyinAwemeId("7123456789012345678")).toBe("7123456789012345678")
    expect(normalizeDouyinAwemeId("https://www.douyin.com/discover?modal_id=7123456789012345678")).toBe("7123456789012345678")
    expect(normalizeDouyinAwemeId("dy_123")).toBeNull()
  })

  it("短链 302 成功后解析出 aweme_id", async () => {
    mockedProbe.mockResolvedValue(LONG_URL)

    await expect(resolveDouyinShortUrl(SHORT_URL)).resolves.toBe(LONG_URL)
    await expect(resolveDouyinAwemeId(SHORT_URL)).resolves.toBe("7123456789012345678")
    expect(mockedProbe).toHaveBeenCalledWith(SHORT_URL, expect.objectContaining({ headers: expect.any(Object) }))
  })

  it("短链探测失败时降级返回 null，不抛错", async () => {
    mockedProbe.mockRejectedValue(new SsrfBlockedError("blocked"))

    await expect(resolveDouyinAwemeId(SHORT_URL)).resolves.toBeNull()
    await expect(resolveDouyinShortUrl(SHORT_URL)).resolves.toBe(SHORT_URL)
    expect(mockedMetric).toHaveBeenCalledWith("ssrf.blocked", { reason: "douyin_short_url" })
  })

  it("非短链长链不触发探测", async () => {
    await expect(resolveDouyinAwemeId(LONG_URL)).resolves.toBe("7123456789012345678")
    expect(mockedProbe).not.toHaveBeenCalled()
  })
})

describe("isDouyinShortUrl —— 严格主机白名单（F18 根因）", () => {
  it("接受真实抖音短链（大小写不敏感）", () => {
    expect(isDouyinShortUrl("https://v.douyin.com/iABC123/")).toBe(true)
    expect(isDouyinShortUrl("http://v.douyin.com/xyz")).toBe(true)
    expect(isDouyinShortUrl("https://V.DOUYIN.COM/xyz")).toBe(true)
  })

  it("拒绝伪冒子域与子串注入（旧实现会放行）", () => {
    expect(isDouyinShortUrl("https://v.douyin.com.evil.com/iABC/")).toBe(false)
    expect(isDouyinShortUrl("https://xdouyin.com/iABC/")).toBe(false)
    expect(isDouyinShortUrl("https://notv.douyin.com/abc")).toBe(false)
    expect(isDouyinShortUrl("https://evil.com/?next=v.douyin.com/abc")).toBe(false)
  })

  it("拒绝非 http(s) 与非法串", () => {
    expect(isDouyinShortUrl("ftp://v.douyin.com/x")).toBe(false)
    expect(isDouyinShortUrl("javascript:alert(1)")).toBe(false)
    expect(isDouyinShortUrl("not a url")).toBe(false)
  })

  it("伪冒子域绝不触发探测（F18-A / F18-B 回归闸门）", async () => {
    const evil = "https://v.douyin.com.evil.com/iABC/"
    await expect(resolveDouyinShortUrl(evil)).resolves.toBe(evil)
    expect(mockedProbe).not.toHaveBeenCalled()
  })
})
