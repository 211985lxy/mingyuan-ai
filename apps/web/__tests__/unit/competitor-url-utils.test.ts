import { describe, expect, it } from "vitest"
import {
  buildWechatChannelsProfileUrl,
  isCompetitorAccountLinkInput,
  validateCompetitorUrl,
} from "@/features/competitor/competitor-url-utils"
import { parseUrl } from "@/lib/tikhub/url-parser"

describe("buildWechatChannelsProfileUrl", () => {
  it("builds a resolvable profile URL from finder_username", () => {
    const url = buildWechatChannelsProfileUrl("v2_abc123@finder")
    expect(url).toBe(
      "https://channels.weixin.qq.com/web/pages/profile/v2_abc123%40finder",
    )
    const parsed = parseUrl(url)
    expect(parsed?.platform).toBe("wechat_channels")
    expect(parsed?.rawUserId).toBe("v2_abc123@finder")
    expect(validateCompetitorUrl(url)).toEqual({ ok: true, url })
  })

  it("rejects empty finder_username", () => {
    expect(() => buildWechatChannelsProfileUrl("  ")).toThrow("缺少视频号账号标识")
  })
})

describe("validateCompetitorUrl messaging", () => {
  it("points users to nickname search when platform is unsupported", () => {
    const result = validateCompetitorUrl("某个视频号昵称")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("搜昵称")
    }
  })
})

describe("isCompetitorAccountLinkInput", () => {
  it("distinguishes account names from pasted links and share text", () => {
    expect(isCompetitorAccountLinkInput("徐沪生—一条创始人")).toBe(false)
    expect(isCompetitorAccountLinkInput("https://v.douyin.com/abc123/")).toBe(true)
    expect(isCompetitorAccountLinkInput("复制打开抖音 https://v.douyin.com/abc123/ 看主页")).toBe(true)
  })
})
