import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import {
  WATCH_VIDEO_RECOMMENDATION_CATEGORIES,
  recommendWatchVideos,
  type WatchVideoRecommendationCategory,
} from "@/lib/competitor-watch-recommendations"
import { watchRecommendationsBodySchema } from "@/features/competitor/contracts/api"

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
  const body = await parseJsonBody(request, watchRecommendationsBodySchema, { maxBytes: 8 * 1024 })
  // 兼容旧客户端传空 projectId：绑定账号只允许在其绑定的项目内做推荐。
  const requestedProjectId = typeof body.projectId === "string" ? body.projectId.trim() : null
  const intent = typeof body.intent === "string" ? body.intent.trim() : ""

  // 解析到账号绑定的项目；若请求体传了其他项目 id，按闸门规则拒绝
  // （PROJECT_CONTEXT_MISMATCH），绝不读取旧项目/历史空项目下的监控账号。
  let projectId: string
  try {
    projectId = (await resolveBoundProject({
      userId: user.id,
      requestedProjectId: requestedProjectId || undefined,
    })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }

  const [project, ipProfile, accounts] = await Promise.all([
    prisma.clientProject.findFirst({
      where: { id: projectId, userId: user.id, status: "active" },
      select: {
        name: true,
        industry: true,
        targetCustomer: true,
        offer: true,
        deliveryGoal: true,
      },
    }),
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
    // 只取绑定项目下的监控账号；历史空项目/旧项目的账号及其视频不进入推荐池。
    prisma.watchAccount.findMany({
      where: { userId: user.id, projectId },
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
