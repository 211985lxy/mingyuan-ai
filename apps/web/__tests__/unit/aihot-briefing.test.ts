import { describe, expect, it } from "vitest"
import {
  AIHOT_BRIEFING_TITLE,
  buildAiHotBriefingMarkdown,
  getBeijingDateKey,
  getBriefingWindow,
  selectBriefingItems,
} from "@/lib/aihot-briefing"
import { AIHOT_USER_AGENT } from "@/lib/aihot-constants"
import type { AiHotItem } from "@/lib/aihot-client"

function item(id: string, category: AiHotItem["category"]): AiHotItem {
  return {
    id,
    category,
    title: `标题 ${id}`,
    source: `来源 ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: "2099-01-01T00:00:00.000Z",
    summary: `这是一条普通人能看懂的摘要 ${id}`,
  }
}

describe("AI HOT briefing formatting", () => {
  it("uses Beijing date and a rolling 24 hour window", () => {
    const now = new Date("2099-01-01T01:00:00.000Z")
    const window = getBriefingWindow(now)

    expect(getBeijingDateKey(now)).toBe("2099-01-01")
    expect(window.windowEnd.toISOString()).toBe("2099-01-01T01:00:00.000Z")
    expect(window.windowStart.toISOString()).toBe("2098-12-31T01:00:00.000Z")
  })

  it("covers known categories first and caps selected items at 15", () => {
    const items = [
      item("model", "ai-models"),
      item("product", "ai-products"),
      item("industry", "industry"),
      item("paper", "paper"),
      item("tip", "tip"),
      item("creator", "creator"),
      item("unknown", null),
      ...Array.from({ length: 20 }, (_, index) => item(`extra-${index}`, "industry")),
    ]

    const selected = selectBriefingItems(items, new Date("2099-01-01T01:00:00.000Z"))

    expect(selected).toHaveLength(15)
    expect(selected.slice(0, 5).map((entry) => entry.categoryLabel)).toEqual([
      "模型发布/更新",
      "产品发布/更新",
      "行业动态",
      "论文研究",
      "技巧与观点",
    ])
    expect(selected[5].categoryLabel).toBe("自媒体热榜")
  })

  it("keeps Markdown user-facing and free of transport details", () => {
    const selected = selectBriefingItems(
      [item("model", "ai-models"), item("paper", "paper"), item("creator", "creator")],
      new Date("2099-01-01T01:00:00.000Z")
    )
    const markdown = buildAiHotBriefingMarkdown(selected)

    expect(markdown).toContain(`# ${AIHOT_BRIEFING_TITLE}`)
    expect(markdown).toContain("当前账号资料/资料库 > 对标账号/对标文案 > 行业热点/AI HOT")
    expect(markdown).toContain("## 模型发布/更新")
    expect(markdown).toContain("## 论文研究")
    expect(markdown).toContain("## 自媒体热榜")
    expect(markdown).not.toMatch(/api\/public|mode=|cursor|HTTP 状态码|状态码|限流|take=/i)
  })

  it("uses browser User-Agent with aihot skill marker", () => {
    expect(AIHOT_USER_AGENT).toContain("Mozilla/5.0")
    expect(AIHOT_USER_AGENT).toContain("aihot-skill/0.2.0")
  })
})
