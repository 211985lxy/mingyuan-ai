import { describe, expect, it } from "vitest"
import { fetchAiNewsRadarCreatorItems } from "@/lib/ai-news-radar-client"

describe("ai-news-radar creator source", () => {
  it("maps creator items into AI HOT briefing items", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        creator_items_ai: [
          {
            id: "creator-1",
            site_id: "tikhub_xiaohongshu",
            source: "大饼讲Ai",
            title_zh: "别光会问AI了，反向操作才是王炸！",
            url: "https://www.xiaohongshu.com/explore/creator-1",
            published_at: "2099-01-01T00:00:00.000Z",
            creator_metrics: {
              likes: 7133,
              comments: 91,
              collects: 12269,
              shares: 682,
            },
          },
        ],
      }),
    } as Response)

    const items = await fetchAiNewsRadarCreatorItems(fetchImpl as typeof fetch)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: "ai-news-radar-creator-1",
      title: "别光会问AI了，反向操作才是王炸！",
      source: "小红书｜大饼讲Ai",
      category: "creator",
      publishedAt: "2099-01-01T00:00:00.000Z",
    })
    expect(items[0].summary).toContain("互动数据")
    expect(items[0].summary).toContain("藏1.2万")
  })

  it("deduplicates repeated creator titles from the same account", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        creator_items_ai: [
          {
            id: "creator-1",
            site_id: "tikhub_xiaohongshu",
            source: "C哥聊科技",
            title: "服了！Claude 设连环计抓国内用户",
            url: "https://www.xiaohongshu.com/explore/a",
          },
          {
            id: "creator-2",
            site_id: "tikhub_xiaohongshu",
            source: "C哥聊科技",
            title: "服了！Claude 设连环计抓国内用户",
            url: "https://www.xiaohongshu.com/explore/b",
          },
        ],
      }),
    } as Response)

    const items = await fetchAiNewsRadarCreatorItems(fetchImpl as typeof fetch)

    expect(items).toHaveLength(1)
  })
})
