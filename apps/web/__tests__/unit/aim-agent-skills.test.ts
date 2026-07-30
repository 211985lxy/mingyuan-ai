import { describe, expect, it } from "vitest"

import { CONTENT_PRODUCER_PURPOSE_SKILL } from "@/lib/aim-agent-skills"

describe("aim agent skills", () => {
  it("merges funnel/lead acquisition and general story into one purpose skill", () => {
    expect(CONTENT_PRODUCER_PURPOSE_SKILL.id).toBe("funnel_lead_story_oral")
    expect(CONTENT_PRODUCER_PURPOSE_SKILL.label).toBe("漏斗获客与故事口播")
    expect(CONTENT_PRODUCER_PURPOSE_SKILL.prompt).toContain("流量漏斗")
    expect(CONTENT_PRODUCER_PURPOSE_SKILL.prompt).toContain("线索获客")
    expect(CONTENT_PRODUCER_PURPOSE_SKILL.prompt).toContain("通用故事")
    expect(CONTENT_PRODUCER_PURPOSE_SKILL.prompt).not.toContain("traffic_funnel")
    expect(CONTENT_PRODUCER_PURPOSE_SKILL.prompt).not.toContain("general_story")
  })
})
