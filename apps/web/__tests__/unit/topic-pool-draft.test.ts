import { describe, expect, it } from "vitest"

import { buildTopicPoolDraftFromSearchParams } from "@/lib/topic-pool-draft"

describe("buildTopicPoolDraftFromSearchParams", () => {
  it("turns a hot topic link into a topic pool draft", () => {
    const params = new URLSearchParams({
      idea: "AI Agent 创业公司融资升温",
      source: "AI HOT",
      summary: "投资人重新关注能直接创造收入的智能体产品。",
    })

    expect(buildTopicPoolDraftFromSearchParams(params)).toEqual({
      title: "AI Agent 创业公司融资升温",
      content: "来源：AI HOT\n摘要：投资人重新关注能直接创造收入的智能体产品。",
    })
  })

  it("returns null when the link has no idea", () => {
    expect(buildTopicPoolDraftFromSearchParams(new URLSearchParams())).toBeNull()
  })
})
