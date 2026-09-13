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
  readMetricValue,
  readWorkStats,
  resolveEngagementMetric,
  type EngagementMetric,
  type WorkStats,
} from "@/lib/aim/account-work-assets"
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

export function buildBaselineFromSortedValues(values: number[]): AccountBaseline | null {
  if (values.length < BASELINE_MIN_SAMPLE) return null
  const pick = (ratio: number): number => {
    const index = Math.min(values.length - 1, Math.floor(ratio * values.length))
    return values[index]
  }
  const mid = Math.floor(values.length / 2)
  const median =
    values.length % 2 === 1 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2)
  return { sampleSize: values.length, p25Views: pick(0.25), medianViews: median, p75Views: pick(0.75) }
}

export interface AccountBaselineResult {
  baseline: AccountBaseline
  metric: EngagementMetric
  metricLabel: string
}

/**
 * 取账号基线：抖音不对外公开播放量（第三方通道 play_count 恒为 0），
 * 播放无信号时按点赞算基线，并把所用指标返回给调用方落库
 * ——否则会得到"预测 0 vs 实际 0"的空转预测。
 */
export async function computeAccountBaselineDetailed(
  projectId: string,
): Promise<AccountBaselineResult | null> {
  const since = new Date(Date.now() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.accountWorkAsset.findMany({
    where: { projectId, platform: "douyin", publishedAt: { gte: since } },
    select: { stats: true },
    orderBy: { publishedAt: "desc" },
    take: 100,
  })
  const statsList = rows
    .map((row) => readWorkStats(row.stats))
    .filter((stats) => Object.keys(stats).length > 0)
  if (statsList.length === 0) return null

  const { metric, label } = resolveEngagementMetric(statsList.map((stats) => ({ stats })))
  const values = statsList
    .map((stats) => readMetricValue(stats, metric))
    .sort((a, b) => a - b)
  const baseline = buildBaselineFromSortedValues(values)
  if (!baseline) return null
  return { baseline, metric, metricLabel: label }
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

    const baselineResult = await computeAccountBaselineDetailed(input.projectId)
    if (!baselineResult) return { created: false, reason: "no_baseline", detail: "近 90 天作品不足 3 条" }

    const prediction = buildBaselinePrediction(
      baselineResult.baseline,
      7,
      input.projectId,
      baselineResult.metricLabel,
    )
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
        metric: baselineResult.metric,
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
