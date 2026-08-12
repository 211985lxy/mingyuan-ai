import { describe, expect, it } from "vitest"

import {
  getAimChannelCapabilities,
  isAimWebOnlyReady,
} from "@/lib/aim/channel-capabilities"
import { computeAimWebOnlyReady } from "@/lib/release-facts"

describe("AIM channel capabilities", () => {
  it("keeps the complete core loop available on web", () => {
    expect(getAimChannelCapabilities("web")).toEqual(expect.arrayContaining([
      "capture",
      "chat",
      "generate",
      "review",
      "publish_record",
      "outcome_backfill",
    ]))
    expect(isAimWebOnlyReady()).toBe(true)
  })

  it("limits Feishu to detachable connector capabilities", () => {
    expect(getAimChannelCapabilities("feishu")).toEqual(expect.arrayContaining([
      "capture",
      "notify",
      "approve",
      "same_record_writeback",
    ]))
    expect(getAimChannelCapabilities("feishu")).not.toContain("owns_content_state")
  })

  it("does not require connector configuration for web-only release readiness", () => {
    expect(computeAimWebOnlyReady({})).toBe(true)
  })
})
