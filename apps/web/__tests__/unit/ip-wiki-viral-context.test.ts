import { describe, expect, it } from "vitest"
import {
  IP_WIKI_PAGE_TYPES,
  IP_WIKI_PAGE_TYPE_LABELS,
  type IpWikiPageType,
} from "@/lib/ip-wiki/types"

describe("viral_methodology is a valid IP Wiki page type", () => {
  it("viral_methodology is included in IP_WIKI_PAGE_TYPES", () => {
    expect(IP_WIKI_PAGE_TYPES).toContain(
      "viral_methodology" satisfies IpWikiPageType
    )
  })

  it("viral_methodology has a label in IP_WIKI_PAGE_TYPE_LABELS", () => {
    expect(
      IP_WIKI_PAGE_TYPE_LABELS["viral_methodology" as IpWikiPageType]
    ).toBe("爆款方法论")
  })
})
