import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { topicGenerateBodySchema } from "@/features/topics/contracts/api"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import { generateAndStoreTopicSelection } from "@/features/topics/services/topic-selection-generation"
import {
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

  const result = await generateAndStoreTopicSelection({
    userId: user.id,
    projectId,
    knowledgeEntryIds,
    forcedElementCodes: elementResult.codes,
    recommendationMode,
    refreshCount: typeof body.refreshCount === "number" ? body.refreshCount : 0,
    requestId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    data: {
      topicSelectionId: result.selectionId,
      cards: result.cards,
      elementCodes: result.elementCodes,
      strategy: result.strategy,
      sourceHighlights: result.sourceHighlights,
      // degraded=true 表示模型链全部失败、返回的是降级模板卡，前端必须提示用户重新生成
      degraded: result.degraded === true,
      model: result.model,
    },
  })
})
