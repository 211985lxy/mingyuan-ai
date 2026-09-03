import { describe, expect, it } from "vitest"
import {
  IP_WIKI_PAGE_TYPES,
  IP_WIKI_PAGE_TYPE_LABELS,
  IP_WIKI_CORE_PAGE_TYPES,
  isIpWikiPageType,
} from "@/lib/ip-wiki/types"

describe("viral_methodology IpWikiPageType", () => {
  it("should be included in IP_WIKI_PAGE_TYPES", () => {
    expect(IP_WIKI_PAGE_TYPES).toContain("viral_methodology")
  })

  it("should have the correct label 爆款方法论", () => {
    expect(IP_WIKI_PAGE_TYPE_LABELS.viral_methodology).toBe("爆款方法论")
  })

  it("should return true from isIpWikiPageType", () => {
    expect(isIpWikiPageType("viral_methodology")).toBe(true)
  })

  it("should NOT be in core page types", () => {
    expect(IP_WIKI_CORE_PAGE_TYPES).not.toContain("viral_methodology")
  })

  it("should include viral_methodology alongside 10 total types (boss_brief was added later)", () => {
    expect(IP_WIKI_PAGE_TYPES).toHaveLength(10)
  })

  it("should preserve all existing types", () => {
    const existing: string[] = [
      "positioning",
      "persona",
      "content_strategy",
      "audience",
      "conversion_path",
      "topic_direction",
      "index",
      "log",
    ]
    for (const type of existing) {
      expect(IP_WIKI_PAGE_TYPES).toContain(type)
    }
  })
})
