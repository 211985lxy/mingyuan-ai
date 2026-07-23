import { describe, expect, it } from "vitest"
import { getImageCandidateUrls } from "@/app/api/proxy-image/proxy-image-utils"
import { isSignedImageUrlExpired } from "@/lib/proxy-image-shared"

describe("proxy image URL candidates", () => {
  it("keeps the signed heic URL as fallback after webp/jpeg variants", () => {
    const url = "https://p11-sign.douyinpic.com/a.heic?x-signature=signed"

    expect(getImageCandidateUrls(url)).toEqual([
      "https://p11-sign.douyinpic.com/a.webp?x-signature=signed",
      "https://p11-sign.douyinpic.com/a.jpeg?x-signature=signed",
      "https://p11-sign.douyinpic.com/a.jpg?x-signature=signed",
      url,
    ])
  })

  it("detects expired douyin signed CDN urls", () => {
    const expired = "https://p26-sign.douyinpic.com/a.heic?x-expires=1782968400&x-signature=x"
    const fresh = "https://p26-sign.douyinpic.com/a.heic?x-expires=2096899200&x-signature=x"
    expect(isSignedImageUrlExpired(expired, 1783000000)).toBe(true)
    expect(isSignedImageUrlExpired(fresh, 1783000000)).toBe(false)
    expect(isSignedImageUrlExpired("https://p3.douyinpic.com/a.jpeg", 1783000000)).toBe(false)
  })
})
