import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { generateTopicCards } from "@/lib/topic-generation"
import type { RecommendationMode } from "@/lib/topic-generation"
import { getTodayAiHotBriefing } from "@/lib/aihot-briefing"
import { VALID_ELEMENT_CODES } from "@/lib/topic-validation"
import type { TopicCard } from "@/lib/topic-validation"
import { hasConflict } from "@/lib/topic-element-logic"
import type { Prisma } from "@/generated/prisma/client"
import type { ContentTheme } from "@/types/api"
import {
  buildBenchmarkAccountSources,
  buildProjectSource,
  buildTopicSources,
  buildVideoCopyExtractionSources,
} from "@/lib/topic-source-builders"
import { topicGenerateBodySchema } from "@/features/topics/contracts/api"

export const maxDuration = 60

const RECOMMENDATION_MODES = new Set<RecommendationMode>(["normal", "daily", "weekly"])

function parseRecommendationMode(value: unknown): RecommendationMode | null {
  if (value == null) return "normal"
  return typeof value === "string" && RECOMMENDATION_MODES.has(value as RecommendationMode)
    ? (value as RecommendationMode)
    : null
}

async function getHotTopicSources() {
  try {
    const briefing = await getTodayAiHotBriefing()
    return briefing.items.slice(0, 4).map((item) => ({
      category: "industry_hot",
      title: item.title,
      content: `${item.categoryLabel}｜${item.summary}｜${item.url}`,
    }))
  } catch (error) {
    console.warn("[topic-gen] AIHOT briefing unavailable:", error)
    return []
  }
}

export const POST = withUserAuth(async (request, { user }) => {
  const requestId = `topic-gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  console.log(`[${requestId}] Topic generation initiated by user ${user.id}`)

  const body = await parseJsonBody(request, topicGenerateBodySchema, { maxBytes: 32 * 1024 })
  const recommendationMode = parseRecommendationMode(body.recommendationMode)
  if (!recommendationMode) {
    return NextResponse.json(
      { error: "recommendationMode 必须是 normal、daily 或 weekly" },
      { status: 400 },
    )
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : null
  const knowledgeEntryIds = Array.isArray(body.knowledgeEntryIds)
    ? body.knowledgeEntryIds.filter((value: unknown): value is string => typeof value === "string")
    : []
  let forcedElementCodes: string[] | undefined
  if (Array.isArray(body.elementCodes)) {
    const raw = body.elementCodes as string[]
    const validSet = new Set<string>(VALID_ELEMENT_CODES)

    const invalid = raw.filter((c) => !validSet.has(c))
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `非法的元素代码: ${invalid.join(", ")}` },
        { status: 400 },
      )
    }

    const deduped = [...new Set(raw)]

    if (deduped.length < 2 || deduped.length > 3) {
      return NextResponse.json(
        { error: "元素数量必须为2或3个（去重后）" },
        { status: 400 },
      )
    }

    for (let i = 0; i < deduped.length; i++) {
      for (let j = i + 1; j < deduped.length; j++) {
        if (hasConflict(deduped[i], deduped[j])) {
          return NextResponse.json(
            { error: `元素冲突: ${deduped[i]} 和 ${deduped[j]} 不可同时使用` },
            { status: 400 },
          )
        }
      }
    }

    forcedElementCodes = deduped
  }

  const refreshCount = typeof body.refreshCount === "number" ? body.refreshCount : 0

  const [project, elements, recentSelections, selectedKnowledge, ipProfile, watchAccounts, videoCopyExtractions] = await Promise.all([
    projectId
      ? prisma.clientProject.findFirst({
          where: { id: projectId, userId: user.id, status: "active" },
          select: {
            id: true,
            name: true,
            industry: true,
            targetCustomer: true,
            offer: true,
            deliveryGoal: true,
          },
        })
      : Promise.resolve(null),
    prisma.topicElement.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
    }),
    // Fetch last 5 topic generations for history-aware derivation
    prisma.topicSelection.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { elementCodes: true, candidates: true },
    }),
    knowledgeEntryIds.length > 0
      ? prisma.knowledgeEntry.findMany({
          where: {
            id: { in: knowledgeEntryIds },
            userId: user.id,
            status: "active",
            ...(projectId ? { projectId } : {}),
          },
          select: { category: true, title: true, content: true },
          take: 12,
        })
      : Promise.resolve([]),
    // Fetch IpProfile for content line themes (降级：不存在时跳过)
    prisma.ipProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        displayName: true,
        nickname: true,
        industry: true,
        primaryOffer: true,
        targetAudience: true,
        ipTraits: true,
        toneOfVoice: true,
        proofPoints: true,
        callToAction: true,
        promptSnapshot: true,
        content: true,
      },
    }).catch(() => null),
    prisma.watchAccount.findMany({
      where: { userId: user.id },
      orderBy: { lastRefreshedAt: "desc" },
      take: 6,
      select: {
        nickname: true,
        targetUrl: true,
        latestVideos: true,
        viralVideos: true,
      },
    }).catch((error) => {
      console.warn(`[${requestId}] Watch account sources unavailable:`, error)
      return []
    }),
    prisma.videoCopyExtraction.findMany({
      where: {
        userId: user.id,
        status: "completed",
      },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: {
        videoTitle: true,
        sourceUrl: true,
        transcript: true,
        analysisResult: true,
      },
    }).catch((error) => {
      console.warn(`[${requestId}] Video copy extraction sources unavailable:`, error)
      return []
    }),
  ])

  if (projectId && !project) {
    return NextResponse.json(
      { error: "客户项目不存在或已归档" },
      { status: 404 },
    )
  }

  if (elements.length < 2) {
    console.error(
      `[${requestId}] Insufficient topic elements: ${elements.length}`,
    )
    return NextResponse.json(
      { error: "系统数据未就绪，请稍后再试" },
      { status: 500 },
    )
  }

  // Extract recent element sets and titles for dedup
  const recentElementSets = recentSelections
    .map((s) => {
      const codes = s.elementCodes
      return Array.isArray(codes) ? (codes as string[]) : []
    })
    .filter((s) => s.length > 0)

  const recentTitles = recentSelections.flatMap((s) => {
    const candidates = s.candidates
    if (!Array.isArray(candidates)) return []
    return (candidates as unknown as TopicCard[])
      .map((c) => c.title)
      .filter(Boolean)
  })

  console.log(
    `[${requestId}] Loaded ${elements.length} elements, ${recentElementSets.length} recent sets, ${recentTitles.length} recent titles, refresh=${refreshCount}`,
  )
  const startTime = Date.now()
  const projectSource = buildProjectSource(project)
  const hotTopicSources = await getHotTopicSources()
  const benchmarkSources = buildBenchmarkAccountSources(watchAccounts)
  const videoCopySources = buildVideoCopyExtractionSources(videoCopyExtractions)
  const topicSources = buildTopicSources({
    projectSource,
    selectedKnowledge,
    benchmarkSources,
    videoCopySources,
    hotTopicSources,
  })

  // Extract content line themes from IpProfile (降级：无定位时 themes 为空)
  const topicIpProfileRecord = ipProfile ?? await prisma.ipProfile.create({
    data: {
      userId: user.id,
      displayName: project?.name ?? "未命名 IP",
      industry: project?.industry,
      primaryOffer: project?.offer,
      targetAudience: project?.targetCustomer,
      isComplete: false,
      isActive: true,
    },
  })
  const contentRaw = topicIpProfileRecord.content as { themes?: ContentTheme[] } | null
  const contentThemes = Array.isArray(contentRaw?.themes) ? contentRaw.themes : []
  const topicIpProfile = topicIpProfileRecord
    ? {
        id: topicIpProfileRecord.id,
        displayName: topicIpProfileRecord.displayName,
        nickname: topicIpProfileRecord.nickname,
        industry: topicIpProfileRecord.industry,
        primaryOffer: topicIpProfileRecord.primaryOffer,
        targetAudience: topicIpProfileRecord.targetAudience,
        ipTraits: topicIpProfileRecord.ipTraits,
        toneOfVoice: topicIpProfileRecord.toneOfVoice,
        proofPoints: topicIpProfileRecord.proofPoints,
        callToAction: topicIpProfileRecord.callToAction,
        promptSnapshot: topicIpProfileRecord.promptSnapshot,
        content: topicIpProfileRecord.content,
      }
    : null

  let result = await generateTopicCards({
    ipProfile: topicIpProfile,
    elements,
    topicSources,
    recommendationMode,
    forcedElementCodes,
    recentElementSets,
    recentTitles,
    refreshCount,
    contentThemes,
  })

  if (!result.success && (benchmarkSources.length > 0 || videoCopySources.length > 0 || hotTopicSources.length > 0)) {
    console.warn(`[${requestId}] Enriched topic generation failed, retrying with base sources: ${result.error}`)
    result = await generateTopicCards({
      ipProfile: topicIpProfile,
      elements,
      topicSources: [
        ...(projectSource ? [projectSource] : []),
        ...selectedKnowledge,
      ],
      recommendationMode,
      forcedElementCodes,
      recentElementSets,
      recentTitles,
      refreshCount,
      contentThemes,
    })
  }

  const duration = Date.now() - startTime
  console.log(
    `[${requestId}] Generation completed in ${duration}ms, success=${result.success}`,
  )

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  const today = new Date().toISOString().split("T")[0]
  const sourceHighlights = topicSources.slice(0, 16)
  const selection = await prisma.topicSelection.create({
    data: {
      userId: user.id,
      ipProfileId: topicIpProfileRecord.id,
      elementCodes: result.elementCodes as unknown as Prisma.InputJsonValue,
      candidates: result.cards as unknown as Prisma.InputJsonValue,
      sourceHighlights: sourceHighlights as unknown as Prisma.InputJsonValue,
      promptText: result.promptText,
      model: result.model,
      status: "pending",
      recommendationMode,
      recommendedDate: today,
    },
  })

  console.log(`[${requestId}] TopicSelection created: ${selection.id}, strategy=${result.strategy}`)

  return NextResponse.json({
    data: {
      topicSelectionId: selection.id,
      cards: result.cards,
      elementCodes: result.elementCodes,
      strategy: result.strategy,
      sourceHighlights,
    },
  })
})
