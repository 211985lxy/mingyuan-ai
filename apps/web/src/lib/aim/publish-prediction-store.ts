import { prisma } from "@/lib/prisma"
import { env } from "@/env"
import {
  PREDICTION_WINDOWS,
  buildPredictedMetrics,
  deviationLearningRequestId,
  isLargeDeviation,
  overallVerdict,
  renderPredictionRetroBlock,
  type ActualMetrics,
  type PredictedMetrics,
} from "@/lib/aim/publish-prediction"
import type { WorkSignalSnapshot } from "@/lib/aim/account-work-asset"
import { loadAccountHistoryContext } from "@/lib/aim/account-work-context"
import { validateLearningCandidateDraft } from "@/lib/aim/learning-candidate"
import { readSupervisorNotificationConfig, sendFeishuSupervisorNotification } from "@/lib/aim/feishu-supervisor-notifier"

function predictionEnabled(): boolean {
  return env.AIM_PUBLISH_PREDICTION_ENABLED?.trim().toLowerCase() !== "false"
}

type PredictionDelegate = {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>
  upsert(args: unknown): Promise<unknown>
  update(args: unknown): Promise<unknown>
}

function predictions(): PredictionDelegate | null {
  return (prisma as unknown as { publishPrediction?: PredictionDelegate }).publishPrediction ?? null
}

async function baselineFromHistory(userId: string, projectId: string | null) {
  const rows = await (prisma as unknown as {
    accountWorkAsset?: { findMany(args: unknown): Promise<Array<{ signalSnapshot: unknown }>> }
  }).accountWorkAsset?.findMany({
    where: { userId, ...(projectId ? { projectId } : {}) },
    take: 40,
    select: { signalSnapshot: true },
  }) ?? []
  if (rows.length === 0) {
    return { views: 800, likes: 20, comments: 4, saves: 6, shares: 3 }
  }
  const scored = rows.map((row) => row.signalSnapshot as WorkSignalSnapshot | null)
  const avg = (pick: (item: WorkSignalSnapshot | null) => number) =>
    Math.round(scored.reduce((sum, item) => sum + pick(item), 0) / Math.max(scored.length, 1))
  return {
    views: avg((item) => item?.playCount ?? 0) || 800,
    likes: avg((item) => item?.diggCount ?? 0) || 20,
    comments: avg((item) => item?.commentCount ?? 0) || 4,
    saves: avg((item) => item?.collectCount ?? 0) || 6,
    shares: avg((item) => item?.shareCount ?? 0) || 3,
  }
}

export async function createPublishPredictions(input: {
  userId: string
  projectId: string | null
  generationId: string
  topicTitle?: string | null
}): Promise<number> {
  if (!predictionEnabled()) return 0
  const delegate = predictions()
  if (!delegate) return 0
  const history = await loadAccountHistoryContext({ userId: input.userId, projectId: input.projectId })
  const baseline = await baselineFromHistory(input.userId, input.projectId)
  const metrics = buildPredictedMetrics(baseline)
  const rationale = [
    `依据账号历史 ${history.count} 条作品基线`,
    input.topicTitle ? `选题：${input.topicTitle}` : "",
  ].filter(Boolean).join("；")
  for (const windowDays of PREDICTION_WINDOWS) {
    await delegate.upsert({
      where: { generationId_windowDays: { generationId: input.generationId, windowDays } },
      create: {
        userId: input.userId,
        projectId: input.projectId,
        generationId: input.generationId,
        windowDays,
        viewsMin: metrics.views.min,
        viewsMax: metrics.views.max,
        likesMin: metrics.likes.min,
        likesMax: metrics.likes.max,
        commentsMin: metrics.comments.min,
        commentsMax: metrics.comments.max,
        savesMin: metrics.saves.min,
        savesMax: metrics.saves.max,
        sharesMin: metrics.shares.min,
        sharesMax: metrics.shares.max,
        confidence: history.count >= 10 ? 0.62 : 0.4,
        rationale,
        accountHistoryHash: history.hash || null,
      },
      update: {},
    })
  }
  void notifyPrediction(input, metrics, rationale)
  return PREDICTION_WINDOWS.length
}

async function notifyPrediction(
  input: { generationId: string; topicTitle?: string | null },
  metrics: PredictedMetrics,
  rationale: string,
) {
  try {
    await sendFeishuSupervisorNotification({
      config: readSupervisorNotificationConfig(),
      notification: {
        type: "human_judgment",
        recordId: input.generationId,
        loopId: "publish-prediction",
        summary: `AI 对「${input.topicTitle || input.generationId}」的 7 天播放预测：${metrics.views.min}-${metrics.views.max}。${rationale}`,
        nextAction: "发布后对照真实数据，偏差会进入人审学习候选。",
      },
    })
  } catch (error) {
    console.warn("[publish-prediction] 飞书通知失败", error instanceof Error ? error.message : error)
  }
}

export async function reconcilePredictionWithOutcome(input: {
  generationId: string
  windowDays: number
  actual: ActualMetrics
}): Promise<{ verdict: string; learningCreated: boolean } | null> {
  const delegate = predictions()
  if (!delegate) return null
  const rows = await delegate.findMany({
    where: { generationId: input.generationId, windowDays: input.windowDays },
    take: 1,
  })
  const row = rows[0] as {
    id: string
    generationId: string
    projectId: string | null
    viewsMin: number
    viewsMax: number
    likesMin: number
    likesMax: number
    commentsMin: number
    commentsMax: number
    savesMin: number
    savesMax: number
    sharesMin: number
    sharesMax: number
  } | undefined
  if (!row) return null
  const predicted: PredictedMetrics = {
    views: { min: row.viewsMin, max: row.viewsMax },
    likes: { min: row.likesMin, max: row.likesMax },
    comments: { min: row.commentsMin, max: row.commentsMax },
    saves: { min: row.savesMin, max: row.savesMax },
    shares: { min: row.sharesMin, max: row.sharesMax },
  }
  const verdict = overallVerdict(input.actual, predicted)
  await delegate.update({
    where: { id: row.id },
    data: {
      reconciledAt: new Date(),
      verdict,
      actualViews: input.actual.views,
      actualLikes: input.actual.likes,
      actualComments: input.actual.comments,
      actualSaves: input.actual.saves,
      actualShares: input.actual.shares,
    },
  })
  let learningCreated = false
  if (isLargeDeviation(input.actual, predicted)) {
    learningCreated = await createDeviationLearningCandidate({
      generationId: input.generationId,
      projectId: row.projectId,
      windowDays: input.windowDays,
      verdict,
      predicted,
      actual: input.actual,
    })
  }
  return { verdict, learningCreated }
}

async function createDeviationLearningCandidate(input: {
  generationId: string
  projectId: string | null
  windowDays: number
  verdict: string
  predicted: PredictedMetrics
  actual: ActualMetrics
}): Promise<boolean> {
  const draft = validateLearningCandidateDraft({
    sourceType: "content_outcome",
    sourceId: input.generationId,
    projectId: input.projectId ?? undefined,
    generationId: input.generationId,
    targetType: "methodology_revision",
    failureCode: "prediction_deviation",
    requestId: deviationLearningRequestId(input.generationId, input.windowDays),
    payload: {
      windowDays: input.windowDays,
      verdict: input.verdict,
      predicted: input.predicted,
      actual: input.actual,
      note: "哪类预测维度系统性偏差，需人审后才注入。",
    },
  })
  try {
    await prisma.learningCandidate.create({
      data: {
        ...draft,
        projectId: draft.projectId ?? null,
        generationId: draft.generationId ?? null,
        failureCode: draft.failureCode ?? null,
        reviewStatus: "pending",
        payload: JSON.parse(JSON.stringify(draft.payload)),
      },
    })
    return true
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return false
    }
    throw error
  }
}

export { renderPredictionRetroBlock }

export async function loadPredictionRetroBlock(generationId: string): Promise<string> {
  const delegate = predictions()
  if (!delegate) return ""
  const rows = await delegate.findMany({
    where: { generationId },
    orderBy: { windowDays: "asc" },
  }) as Array<{
    windowDays: number
    viewsMin: number
    viewsMax: number
    actualViews: number | null
    verdict: string | null
  }>
  return renderPredictionRetroBlock(rows)
}
