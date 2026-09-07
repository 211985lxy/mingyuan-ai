import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { generateTopicCards } from "@/lib/topic-generation"
import type { Prisma } from "@/generated/prisma/client"
import { buildBenchmarkAccountSources, buildProjectSource, buildTopicSources, buildVideoCopyExtractionSources } from "@/lib/topic-source-builders"
import { topicGenerateBodySchema } from "@/features/topics/contracts/api"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import {
  deriveRecentElementSets,
  deriveRecentTitles,
  ensureTopicIpProfile,
  getHotTopicSources,
  loadTopicGenerationContext,
  parseRecommendationMode,
  resolveForcedElementCodes,
} from "@/features/topics/services/topic-generation-request"

export const maxDuration = 60

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

  const requestedProjectId = typeof body.projectId === "string" ? body.projectId : null
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
  const knowledgeEntryIds = Array.isArray(body.knowledgeEntryIds)
    ? body.knowledgeEntryIds.filter((value: unknown): value is string => typeof value === "string")
    : []
  const elementResult = resolveForcedElementCodes(body.elementCodes)
  if (!elementResult.ok) {
    return NextResponse.json({ error: elementResult.error }, { status: 400 })
  }
  const forcedElementCodes = elementResult.codes

  const refreshCount = typeof body.refreshCount === "number" ? body.refreshCount : 0

  const [project, elements, recentSelections, selectedKnowledge, ipProfile, watchAccounts, videoCopyExtractions] =
    await loadTopicGenerationContext({ userId: user.id, projectId, knowledgeEntryIds, requestId })

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
  const recentElementSets = deriveRecentElementSets(recentSelections)
  const recentTitles = deriveRecentTitles(recentSelections)

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

  const { ipProfileRecord, contentThemes, topicIpProfile } = await ensureTopicIpProfile({
    userId: user.id,
    project,
    existing: ipProfile,
  })

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
    userId: user.id,
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
      userId: user.id,
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
      projectId,
      ipProfileId: ipProfileRecord.id,
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
