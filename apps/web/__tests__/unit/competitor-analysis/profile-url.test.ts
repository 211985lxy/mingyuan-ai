import { describe, expect, it, vi } from "vitest"
import { resolveCompetitorProfileInput } from "@/lib/competitor-analysis/profile-url"

describe("resolveCompetitorProfileInput", () => {
  it("normalizes a Douyin short link into a canonical profile URL", async () => {
    const result = await resolveCompetitorProfileInput(
      {
        platform: "douyin",
        rawUserId: null,
        pureUrl: "https://v.douyin.com/9CCtQ-z2ORg/",
      },
      {
        douyinResolver: {
          resolveUrl: vi.fn(async () => "MS4wLjABAAAAshort"),
        },
      },
    )

    expect(result).toEqual({
      targetUrl: "https://www.douyin.com/user/MS4wLjABAAAAshort",
      platformUserId: "MS4wLjABAAAAshort",
    })
  })

  it("preserves a Douyin user id from a full profile URL", async () => {
    const result = await resolveCompetitorProfileInput({
      platform: "douyin",
      rawUserId: "MS4wLjABAAAAfull",
      pureUrl: "https://www.douyin.com/user/MS4wLjABAAAAfull?from_tab_name=main",
    })

    expect(result).toEqual({
      targetUrl: "https://www.douyin.com/user/MS4wLjABAAAAfull",
      platformUserId: "MS4wLjABAAAAfull",
    })
  })
})
