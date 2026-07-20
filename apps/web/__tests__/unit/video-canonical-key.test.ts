import { describe, expect, it } from "vitest"
import { extractCanonicalVideoKey, resolveCanonicalSourceKey, buildCanonicalSourceKey } from "@/lib/video-canonical-key"

describe("extractCanonicalVideoKey", () => {
  it("extracts Douyin video ID from long-form URL", () => {
    const key = extractCanonicalVideoKey("https://www.douyin.com/video/7123456789012345678")
    expect(key.platform).toBe("douyin")
    expect(key.videoId).toBe("7123456789012345678")
  })

  it("returns null videoId for Douyin short links", () => {
    const key = extractCanonicalVideoKey("https://v.douyin.com/abcdef/")
    expect(key.platform).toBe("douyin")
    expect(key.videoId).toBeNull()
  })

  it("extracts Bilibili BV ID", () => {
    const key = extractCanonicalVideoKey("https://www.bilibili.com/video/BV1GJ411x7h7")
    expect(key.platform).toBe("bilibili")
    expect(key.videoId).toBe("BV1GJ411x7h7")
  })

  it("extracts Bilibili av ID", () => {
    const key = extractCanonicalVideoKey("https://www.bilibili.com/video/av123456")
    expect(key.platform).toBe("bilibili")
    expect(key.videoId).toBe("av123456")
  })

  it("returns null for Bilibili short links (b23.tv)", () => {
    const key = extractCanonicalVideoKey("https://b23.tv/abcdef")
    expect(key.platform).toBe("bilibili")
    expect(key.videoId).toBeNull()
  })

  it("extracts Kuaishou video ID from numeric URLs", () => {
    const key = extractCanonicalVideoKey("https://www.kuaishou.com/video/3xxxxxxxxxxxxxxxx")
    // Non-numeric characters don't match the \d{8,} regex
    expect(key.platform).toBe("kuaishou")
    expect(key.videoId).toBeNull()
    // Real numeric IDs work fine
    const key2 = extractCanonicalVideoKey("https://www.kuaishou.com/video/31234567890123")
    expect(key2.platform).toBe("kuaishou")
    expect(key2.videoId).toBe("31234567890123")
  })

  it("extracts Xiaohongshu note ID", () => {
    const key = extractCanonicalVideoKey("https://www.xiaohongshu.com/explore/abcdef123456abcdef123456")
    expect(key.platform).toBe("xiaohongshu")
    expect(key.videoId).toBe("abcdef123456abcdef123456")
  })

  it("extracts YouTube video ID from watch URL", () => {
    const key = extractCanonicalVideoKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(key.platform).toBe("youtube")
    expect(key.videoId).toBe("dQw4w9WgXcQ")
  })

  it("extracts YouTube video ID from youtu.be short link", () => {
    const key = extractCanonicalVideoKey("https://youtu.be/dQw4w9WgXcQ")
    expect(key.platform).toBe("youtube")
    expect(key.videoId).toBe("dQw4w9WgXcQ")
  })

  it("returns null for WeChat channels (no extractable ID)", () => {
    const key = extractCanonicalVideoKey("https://channels.weixin.qq.com/play/someId")
    expect(key.platform).toBe("channels")
    expect(key.videoId).toBeNull()
  })

  it("handles malformed URLs gracefully", () => {
    const key = extractCanonicalVideoKey("not-a-url")
    expect(key.platform).toBe("unknown")
    expect(key.videoId).toBeNull()
  })
})

describe("buildCanonicalSourceKey", () => {
  it("returns platform:videoId when videoId is available", () => {
    const key = extractCanonicalVideoKey("https://www.douyin.com/video/7123456789")
    expect(buildCanonicalSourceKey(key)).toBe("douyin:7123456789")
  })

  it("returns null when videoId is not available", () => {
    const key = extractCanonicalVideoKey("https://v.douyin.com/abc/")
    expect(buildCanonicalSourceKey(key)).toBeNull()
  })
})

describe("resolveCanonicalSourceKey", () => {
  it("is a shortcut combining extract + build", () => {
    expect(resolveCanonicalSourceKey("https://www.bilibili.com/video/BV1GJ411x7h7")).toBe("bilibili:BV1GJ411x7h7")
    expect(resolveCanonicalSourceKey("https://v.douyin.com/abc/")).toBeNull()
  })
})
