import { describe, expect, it } from "vitest"
import { decideAiHotItems, decideDouyinItems, decideLast30DaysItems } from "@/lib/hot-decisions"
import type { AiHotItem } from "@/lib/aihot-client"
import type { Last30DaysItem } from "@/lib/market-insights/last30days"
import type { HotTopic } from "@/types/content-template"

function marketItem(input: Partial<Last30DaysItem> & { id: string; title: string }): Last30DaysItem {
  return {
    platform: "wechat",
    excerpt: "商业创业和企业经营讨论",
    url: `https://example.com/${input.id}`,
    author: "官方账号",
    date: new Date().toISOString(),
    score: 80,
    ...input,
  }
}

function douyinTopic(input: Partial<HotTopic> & { id: string; title: string }): HotTopic {
  return {
    rank: 1,
    hotValue: 800000,
    label: "hot",
    videoCount: 20000,
    coverUrl: null,
    douyinSearchUrl: `https://www.douyin.com/search/${encodeURIComponent(input.title)}`,
    fetchedAt: new Date().toISOString(),
    ...input,
  }
}

describe("hot decision rules", () => {
  it("does not filter AI HOT selected items again", () => {
    const items: AiHotItem[] = [
      { id: "a", title: "AI 模型更新", source: "AI HOT", url: "https://example.com/a" },
      { id: "b", title: "很短", source: "AI HOT", url: "https://example.com/b" },
    ]

    const decisions = decideAiHotItems(items)

    expect(decisions).toHaveLength(2)
    expect(decisions.every((item) => item.isPreselected)).toBe(true)
    expect(decisions.every((item) => item.sourceTier === "selected")).toBe(true)
  })

  it("keeps broader business and startup hotlist items", () => {
    const decisions = decideLast30DaysItems([
      marketItem({ id: "low", title: "明星恋情曝光", score: 90 }),
      marketItem({ id: "high", title: "加盟品牌价格战影响小店生意", score: 85 }),
      marketItem({ id: "finance", title: "房产投资进入资产重估周期", score: 82 }),
    ])

    expect(decisions.map((item) => item.title)).toContain("加盟品牌价格战影响小店生意")
    expect(decisions.map((item) => item.title)).toContain("房产投资进入资产重估周期")
    expect(decisions[0].verdict).toMatch(/worth|watch/)
  })

  it("clusters duplicate events and keeps one lead item", () => {
    const decisions = decideLast30DaysItems([
      marketItem({ id: "a", title: "AI 工具帮助企业获客增长", score: 80 }),
      marketItem({ id: "b", title: "AI工具帮助企业获客增长", score: 70 }),
    ])

    expect(decisions).toHaveLength(1)
    expect(decisions[0].clusterSize).toBe(2)
  })

  it("filters low value or risky douyin hot topics", () => {
    const decisions = decideDouyinItems([
      douyinTopic({ id: "risk", title: "明星离婚八卦" }),
      douyinTopic({ id: "sports", title: "厄瓜多尔0:0库拉索" }),
      douyinTopic({ id: "fake-ai", title: "谐音歌词版WAIYA" }),
      douyinTopic({ id: "platform-only", title: "哈兰德发抖音用了森系滤镜" }),
      douyinTopic({ id: "fit", title: "小店老板靠团购提升门店营收" }),
    ])

    expect(decisions.map((item) => item.title)).toEqual(["小店老板靠团购提升门店营收"])
  })
})
