import { describe, expect, it } from "vitest"

import {
  buildDefaultKnowledgeTags,
  buildKnowledgeCleaningSuggestion,
  parseKnowledgeTags,
} from "@/lib/knowledge-tags"

describe("knowledge tags", () => {
  it("parses structured cleanup tags", () => {
    expect(parseKnowledgeTags([
      "kb_scope:ip",
      "asset_role:story",
      "usable_for:xhs",
      "usable_for:topic",
      "confidence:pending_verify",
      "普通标签",
    ])).toEqual({
      scope: "ip",
      assetRole: "story",
      usableFor: ["xhs", "topic"],
      confidence: "pending_verify",
      otherTags: ["普通标签"],
      isCleaned: true,
    })
  })

  it("keeps legacy tags valid as uncleaned knowledge", () => {
    expect(parseKnowledgeTags(["客户案例"])).toMatchObject({
      scope: null,
      assetRole: null,
      usableFor: [],
      confidence: null,
      otherTags: ["客户案例"],
      isCleaned: false,
    })
  })

  it("parses strategy role tags", () => {
    expect(parseKnowledgeTags(["kb_scope:project", "asset_role:strategy"])).toMatchObject({
      scope: "project",
      assetRole: "strategy",
      otherTags: [],
      isCleaned: true,
    })
  })

  it("builds default tags for topic pool sources", () => {
    expect(buildDefaultKnowledgeTags("daily_inspiration")).toEqual([
      "kb_scope:project",
      "asset_role:inspiration",
      "usable_for:topic",
      "confidence:user_claim",
    ])
    expect(buildDefaultKnowledgeTags("benchmark_reference")).toContain("asset_role:benchmark")
    expect(buildDefaultKnowledgeTags("user_insight")).toContain("asset_role:pain")
  })

  it("suggests cleanup tags without overwriting current tags", () => {
    const tags = buildKnowledgeCleaningSuggestion({
      category: "boss_experience",
      title: "创始人转折点",
      content: "这次失败让我重新判断行业价值。",
      tags: ["旧标签"],
    })

    expect(tags).toEqual([
      "旧标签",
      "kb_scope:ip",
      "asset_role:story",
      "usable_for:xhs",
      "usable_for:wechat",
      "usable_for:video",
      "confidence:user_claim",
    ])
  })
})
