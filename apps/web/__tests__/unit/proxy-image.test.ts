import { describe, expect, it } from "vitest"
import { getImageCandidateUrls } from "@/app/api/proxy-image/proxy-image-utils"

describe("proxy image URL candidates", () => {
  it("keeps the signed heic URL as fallback", () => {
    const url = "https://p11-sign.douyinpic.com/a.heic?x-signature=signed"

    expect(getImageCandidateUrls(url)).toEqual([
      "https://p11-sign.douyinpic.com/a.webp?x-signature=signed",
      url,
    ])
  })
})
