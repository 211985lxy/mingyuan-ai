import { NextRequest, NextResponse } from "next/server"
import { getLatestHotList } from "@/lib/douyin-hot"
import { fetchAiHotSelectedItems } from "@/lib/aihot-client"
import { matchTemplatesForHotTopic, matchSeasonalTemplates } from "@/lib/template-matching"
import type { HotTopic } from "@/types/content-template"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const source = searchParams.get("source")

  let topics: HotTopic[] = []

  if (source === "aihot") {
    try {
      const aihotData = await fetchAiHotSelectedItems()
      topics = aihotData.items.map((item, index) => ({
        id: item.id,
        rank: index + 1,
        title: item.title,
        hotValue: 0,
        label: "recommended" as const,
        videoCount: 0,
        coverUrl: null,
        douyinSearchUrl: item.url, // 映射原资讯 URL 为 douyinSearchUrl 以便按钮直接跳转
        fetchedAt: item.publishedAt || new Date().toISOString(),
      }))
    } catch (e) {
      console.error("Failed to fetch from AI HOT, falling back to empty list:", (e as Error).message)
      topics = []
    }
  } else {
    topics = await getLatestHotList()
  }

  // Enrich with template recommendations
  const seasonalTemplates = await matchSeasonalTemplates()
  const enriched = await Promise.all(
    topics.map(async (topic) => {
      const keywordMatches = await matchTemplatesForHotTopic(topic.title)
      const combined = [...keywordMatches]
      for (const st of seasonalTemplates) {
        if (!combined.find((c) => c.id === st.id)) combined.push(st)
      }
      return {
        ...topic,
        recommendedTemplates: combined.slice(0, 3),
      }
    })
  )

  return NextResponse.json(
    { data: { topics: enriched, updatedAt: new Date().toISOString() } },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    }
  )
}

