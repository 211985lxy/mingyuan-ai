import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import {
  WATCH_VIDEO_RECOMMENDATION_CATEGORIES,
  recommendWatchVideos,
  type WatchVideoRecommendationCategory,
} from "@/lib/competitor-watch-recommendations"

export const runtime = "nodejs"

const CATEGORY_SET = new Set<string>(WATCH_VIDEO_RECOMMENDATION_CATEGORIES)

function parseCategories(value: unknown): WatchVideoRecommendationCategory[] | undefined {
  if (!Array.isArray(value)) return undefined
  const categories = value.filter((item): item is WatchVideoRecommendationCategory =>
    typeof item === "string" && CATEGORY_SET.has(item),
  )
  return categories.length > 0 ? categories : undefined
}

function compactText(value: unknown, limit = 1200): string {
  if (!value) return ""
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return text.replace(/\s+/g, " ").trim().slice(0, limit)
}

export const POST = withUserAuth(async (request, { user }) => {
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const projectId = typeof body.projectId === "string" ? body.projectId : null
  const intent = typeof body.intent === "string" ? body.intent.trim() : ""

  const [project, ipProfile, accounts] = await Promise.all([
    projectId
      ? prisma.clientProject.findFirst({
          where: { id: projectId, userId: user.id, status: "active" },
          select: {
            name: true,
            industry: true,
            targetCustomer: true,
            offer: true,
            deliveryGoal: true,
          },
        })
      : Promise.resolve(null),
    prisma.ipProfile.findUnique({
      where: { userId: user.id },
      select: {
        industry: true,
        primaryOffer: true,
        targetAudience: true,
        ipTraits: true,
        promptSnapshot: true,
      },
    }).catch(() => null),
    prisma.watchAccount.findMany({
      where: { userId: user.id },
      orderBy: [{ lastRefreshedAt: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        targetUrl: true,
        platform: true,
        nickname: true,
        latestVideos: true,
        viralVideos: true,
        lastRefreshedAt: true,
      },
    }),
  ])

  if (projectId && !project) {
    return NextResponse.json({ error: "客户项目不存在或已归档" }, { status: 404 })
  }

  const targetText = [
    intent,
    project?.name,
    project?.industry,
    project?.targetCustomer,
    project?.offer,
    project?.deliveryGoal,
    ipProfile?.industry,
    ipProfile?.targetAudience,
    ipProfile?.primaryOffer,
    ipProfile?.ipTraits,
    ipProfile?.promptSnapshot,
  ].map((item) => compactText(item)).filter(Boolean).join("\n")

  const items = recommendWatchVideos({
    accounts,
    targetText,
    categories: parseCategories(body.categories),
    limit: typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 12) : 6,
  })

  return NextResponse.json({
    data: {
      items,
      generatedAt: new Date().toISOString(),
      sourceSummary: {
        accountCount: accounts.length,
        videoCount: accounts.reduce((sum, account) => {
          const latest = Array.isArray(account.latestVideos) ? account.latestVideos.length : 0
          const viral = Array.isArray(account.viralVideos) ? account.viralVideos.length : 0
          return sum + latest + viral
        }, 0),
      },
    },
  })
})
