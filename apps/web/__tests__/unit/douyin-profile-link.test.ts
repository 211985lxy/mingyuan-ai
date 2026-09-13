import { describe, expect, it } from "vitest"

import { isValidSecUserId, normalizeDouyinProfileUrl } from "@/lib/aim/douyin-profile-link"

describe("normalizeDouyinProfileUrl", () => {
  it("接受抖音主页与短链分享链接", () => {
    expect(normalizeDouyinProfileUrl("https://www.douyin.com/user/MS4wLjABAAAAxyz").ok).toBe(true)
    expect(normalizeDouyinProfileUrl("https://v.douyin.com/abcdEF/").ok).toBe(true)
    expect(normalizeDouyinProfileUrl("  https://douyin.com/user/abc  ")).toEqual({
      ok: true,
      url: "https://douyin.com/user/abc",
    })
  })

  it("拒绝非抖音域名（不把任意 URL 交给第三方解析）", () => {
    const result = normalizeDouyinProfileUrl("https://evil.example.com/user/abc")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("douyin.com")
  })

  it("拒绝空值、非字符串与非法 URL", () => {
    expect(normalizeDouyinProfileUrl("").ok).toBe(false)
    expect(normalizeDouyinProfileUrl(null).ok).toBe(false)
    expect(normalizeDouyinProfileUrl(123).ok).toBe(false)
    expect(normalizeDouyinProfileUrl("随意文本").ok).toBe(false)
    expect(normalizeDouyinProfileUrl("ftp://douyin.com/user/a").ok).toBe(false)
  })

  it("超长输入被截断而不是报错", () => {
    const long = `https://www.douyin.com/user/${"a".repeat(2000)}`
    const result = normalizeDouyinProfileUrl(long)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.url.length).toBeLessThanOrEqual(500)
  })
})

describe("isValidSecUserId", () => {
  it("接受形如 MS4wLjABAAAA 的标识", () => {
    expect(isValidSecUserId("MS4wLjABAAAAabcdefghij")).toBe(true)
    expect(isValidSecUserId("MS4wLjABAAAA_xy-z12")).toBe(true)
  })

  it("拒绝过短、含非法字符与非字符串", () => {
    expect(isValidSecUserId("short")).toBe(false)
    expect(isValidSecUserId("MS4wLjABAAAA abc")).toBe(false)
    expect(isValidSecUserId("MS4wLjABAAAA/abc")).toBe(false)
    expect(isValidSecUserId(null)).toBe(false)
    expect(isValidSecUserId(undefined)).toBe(false)
  })
})
