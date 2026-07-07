import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"

/**
 * GET /api/topics/today?mode=daily
 *
 * 查询当前用户今天是否已生成过指定模式的选题推荐。
 * - 命中 → 返回 { mode: "cached", topicSelectionId, cards }
 * - 未命中 → 返回 { mode: "missing" }
 *
 * 不自动生成（避免 GET 有副作用），由前端按需触发 POST /api/topics/generate。
 */
export const GET = withUserAuth(async (request, { user }) => {
  const url = new URL(request.url)
  const mode = url.searchParams.get("mode") || "daily"
  const today = new Date().toISOString().split("T")[0] // YYYY-MM-DD

  const selection = await prisma.topicSelection.findFirst({
    where: {
      userId: user.id,
      recommendationMode: mode,
      recommendedDate: today,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      candidates: true,
      sourceHighlights: true,
      createdAt: true,
    },
  })

  if (!selection) {
    return NextResponse.json({ mode: "missing" })
  }

  const cards = Array.isArray(selection.candidates) ? selection.candidates : []
  const sourceHighlights = Array.isArray(selection.sourceHighlights) ? selection.sourceHighlights : undefined
  return NextResponse.json({
    mode: "cached",
    topicSelectionId: selection.id,
    cards,
    sourceHighlights,
    createdAt: selection.createdAt,
  })
})
