/**
 * 发布登记时的事前预测触发（WP-A3 接线）。
 *
 * 内容登记为 published 时，用该项目绑定账号近 90 天真实播放四分位生成
 * 7 天窗口预测区间，落 PublishPrediction（幂等：generation+window 唯一）。
 * 无账号基线（<3 条作品）时如实跳过——宁可不表态，也不拍脑袋。
 * 失败绝不阻断发布登记主流程（fire-and-forget，错误只落日志）。
 */

import { prisma } from "@/lib/prisma"
import {
  buildBaselinePrediction,
  type AccountBaseline,
} from "@/lib/aim/publish-prediction"

const BASELINE_WINDOW_DAYS = 90
const BASELINE_MIN_SAMPLE = 3

export interface PublishPredictionTriggerResult {
  created: boolean
  reason: "created" | "already_exists" | "no_baseline" | "error"
  detail?: string
}

export function buildBaselineFromSortedViews(views: number[]): AccountBaseline | null {
  if (views.length < BASELINE_MIN_SAMPLE) return null
  const pick = (ratio: number): number => {
    const index = Math.min(views.length - 1, Math.floor(ratio * views.length))
    return views[index]
  }
  const mid = Math.floor(views.length / 2)
  const median =
    views.length % 2 === 1 ? views[mid] : Math.round((views[mid - 1] + views[mid]) / 2)
  return { sampleSize: views.length, p25Views: pick(0.25), medianViews: median, p75Views: pick(0.75) }
}

export async function computeAccountBaseline(projectId: string): Promise<AccountBaseline | null> {
  const since = new Date(Date.now() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.accountWorkAsset.findMany({
    where: { projectId, platform: "douyin", publishedAt: { gte: since } },
    select: { stats: true },
    orderBy: { publishedAt: "desc" },
    take: 100,
  })
  const views = rows
    .map((row) => {
      const stats = row.stats as Record<string, unknown> | null
      const value = stats?.views
      return typeof value === "number" && Number.isFinite(value) ? value : null
    })
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)
  return buildBaselineFromSortedViews(views)
}

export async function createPublishPredictionOnRegister(input: {
  userId: string
  generationId: string
  projectId: string | null
}): Promise<PublishPredictionTriggerResult> {
  try {
    if (!input.projectId) return { created: false, reason: "no_baseline", detail: "内容未归属项目" }
    const existing = await prisma.publishPrediction.findUnique({
      where: { generationId_windowDay: { generationId: input.generationId, windowDay: 7 } },
      select: { id: true },
    })
    if (existing) return { created: false, reason: "already_exists" }

    const baseline = await computeAccountBaseline(input.projectId)
    if (!baseline) return { created: false, reason: "no_baseline", detail: "近 90 天作品不足 3 条" }

    const prediction = buildBaselinePrediction(baseline, 7, input.projectId)
    await prisma.publishPrediction.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        generationId: input.generationId,
        windowDay: 7,
        predictedLow: prediction.low,
        predictedHigh: prediction.high,
        confidence: prediction.confidence,
        rationaleDigest: prediction.rationaleDigest,
        baselineHash: prediction.baselineHash,
      },
    })
    return { created: true, reason: "created" }
  } catch (error) {
    return {
      created: false,
      reason: "error",
      detail: error instanceof Error ? error.message : "预测生成失败",
    }
  }
}
