import { describe, expect, it } from "vitest"

import { getAimAgentGuide } from "@/lib/aim-agent-guides"
import {
  formatOpportunityMetric,
  toCollectionItemPayload,
} from "@/features/opportunities/lib/opportunity-collection-client"
import type { OpportunityItem } from "@/features/opportunities/contracts/types"

const sampleItem: OpportunityItem = {
  platform: "douyin",
  sourceId: "abc123",
  sourceUrl: "https://www.douyin.com/video/abc123",
  title: "数字供暖怎么讲清楚",
  author: { id: "u1", name: "测试号", followerCount: 12000 },
  metrics: { likes: 3500, comments: 120 },
  opportunityScore: 0.82,
  scoreConfidence: "high",
}

describe("opportunity-collection-client", () => {
  it("映射收藏字段时保留平台与互动数", () => {
    const payload = toCollectionItemPayload(sampleItem)
    expect(payload.platform).toBe("douyin")
    expect(payload.sourceId).toBe("abc123")
    expect(payload.likes).toBe(3500)
    expect(payload.authorName).toBe("测试号")
  })

  it("格式化互动数", () => {
    expect(formatOpportunityMetric(3500)).toBe("3.5k")
    expect(formatOpportunityMetric(12000)).toBe("1.2w")
  })
})

describe("选题策划搜对标技能", () => {
  it("提供打开搜索面板的技能", () => {
    const skill = getAimAgentGuide("business_diagnosis").skills.find(
      (item) => item.id === "market_benchmark_search",
    )
    expect(skill?.workbenchAction).toBe("open_benchmark_search")
    expect(skill?.label).toContain("搜对标")
  })
})
