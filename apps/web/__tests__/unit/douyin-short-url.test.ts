import { afterEach, describe, expect, it, vi } from "vitest"
import {
  extractDouyinAwemeId,
  normalizeDouyinAwemeId,
  resolveDouyinAwemeId,
  resolveDouyinShortUrl,
} from "@/lib/douyin-short-url"

describe("抖音短链解析", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://www.douyin.com/video/7123456789012345678" },
    })))

    await expect(resolveDouyinShortUrl("https://v.douyin.com/AbCdEf/"))
      .resolves.toBe("https://www.douyin.com/video/7123456789012345678")
    await expect(resolveDouyinAwemeId("https://v.douyin.com/AbCdEf/"))
      .resolves.toBe("7123456789012345678")
  })

  it("短链探测失败时返回 null，不抛错", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down")
    }))

    await expect(resolveDouyinAwemeId("https://v.douyin.com/AbCdEf/")).resolves.toBeNull()
  })
})
