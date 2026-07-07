import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import {
  HotTopicIntelligenceError,
  getOrGenerateHotTopicInsight,
} from "@/lib/hot-topic-intelligence"

export const GET = withUserAuth(async (_request, { params }) => {
  const topicId = params?.id
  if (!topicId) {
    return NextResponse.json({ error: "Missing topic id" }, { status: 400 })
  }

  try {
    const data = await getOrGenerateHotTopicInsight(topicId)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof HotTopicIntelligenceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      )
    }

    console.error("[hot-topics/insight] unexpected error:", error)
    return NextResponse.json(
      { error: "热点洞察生成失败" },
      { status: 500 },
    )
  }
})
