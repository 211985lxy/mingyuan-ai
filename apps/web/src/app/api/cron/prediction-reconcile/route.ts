import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import {
  biasCandidateRequestId,
  detectSystematicBias,
  reconcilePrediction,
  type ReconciledOutcome,
} from "@/lib/aim/publish-prediction"

export const runtime = "nodejs"
export const maxDuration = 60

async function reconcilePendingPredictions(now: Date): Promise<{ scanned: number; reconciled: number; awaitingData: number }> {
  const pending = await prisma.publishPrediction.findMany({
    where: { reconciledAt: null },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, userId: true, projectId: true, generationId: true, windowDay: true, predictedLow: true, predictedHigh: true },
  })

  let reconciled = 0
  let awaitingData = 0
  for (const prediction of pending) {
    const outcome = await prisma.contentOutcome.findUnique({
      where: {
        userId_generationId_collectWindowDay: {
          userId: prediction.userId,
          generationId: prediction.generationId,
          collectWindowDay: prediction.windowDay,
        },
      },
      select: { views: true },
    })
    if (!outcome || outcome.views === null || outcome.views === undefined) {
      awaitingData += 1
      continue
    }
    const result = reconcilePrediction({ low: prediction.predictedLow, high: prediction.predictedHigh }, outcome.views)
    await prisma.publishPrediction.update({
      where: { id: prediction.id },
      data: {
        verdict: result.verdict,
        deviationRatio: result.deviationRatio,
        actualViews: outcome.views,
        reconciledAt: now,
      },
    })
    reconciled += 1
  }
  return { scanned: pending.length, reconciled, awaitingData }
}

async function loadRecentReconciled(): Promise<Array<ReconciledOutcome & { projectId: string | null }>> {
  const recent = await prisma.publishPrediction.findMany({
    where: { reconciledAt: { not: null, gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    select: { projectId: true, windowDay: true, verdict: true, deviationRatio: true },
    take: 500,
  })
  return recent
    .filter((row) => row.verdict !== null)
    .map((row) => ({
      projectId: row.projectId,
      windowDay: row.windowDay,
      verdict: row.verdict as "within" | "over" | "under",
      deviationRatio: row.deviationRatio === null ? null : Number(row.deviationRatio),
    }))
}

async function emitBiasCandidates(
  outcomes: Array<ReconciledOutcome & { projectId: string | null }>,
  now: Date,
): Promise<{ created: string[]; skippedExisting: string[] }> {
  const drafts = detectSystematicBias(outcomes)
  const created: string[] = []
  const skippedExisting: string[] = []
  for (const draft of drafts) {
    const projectId = outcomes.find((row) => row.windowDay === draft.payload.windowDay)?.projectId ?? null
    const requestId = biasCandidateRequestId(projectId, draft, now)
    try {
      await prisma.learningCandidate.create({
        data: {
          sourceType: "content_outcome",
          sourceId: `prediction-bias:${projectId ?? "none"}:${draft.payload.windowDay}`,
          projectId,
          generationId: null,
          targetType: draft.targetType,
          failureCode: draft.failureCode,
          payload: draft.payload,
          reviewStatus: "pending",
          requestId,
        },
      })
      created.push(requestId)
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        skippedExisting.push(requestId)
        continue
      }
      throw error
    }
  }
  return { created, skippedExisting }
}

/**
 * 预测对账 cron（WP-A3）：
 *   1. 找未对账的发布前预测，窗口效果数据已回流（ContentOutcome 有播放）即对账回填 verdict；
 *   2. 对近 30 天已对账记录跑系统性偏差检测，按 项目×窗口×方向×自然周 幂等生成学习候选
 *      （methodology_revision，reviewStatus=pending，仍需人批——学习闭环止于人审）。
 *
 * 不改 WP-1.1 的 outcome-autofetch 语义；本路由只读 ContentOutcome。
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const { scanned, reconciled, awaitingData } = await reconcilePendingPredictions(now)
  const outcomes = await loadRecentReconciled()
  const biasCandidates = await emitBiasCandidates(outcomes, now)

  return NextResponse.json({
    ranAt: now.toISOString(),
    scanned,
    reconciled,
    awaitingData,
    biasCandidates,
  })
}
