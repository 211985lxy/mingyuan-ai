export const PREDICTION_WINDOWS = [7, 14, 30] as const
export type PredictionWindow = (typeof PREDICTION_WINDOWS)[number]
export type PredictionVerdict = "hit" | "over" | "under"

export interface MetricRange {
  min: number
  max: number
}

export interface PredictedMetrics {
  views: MetricRange
  likes: MetricRange
  comments: MetricRange
  saves: MetricRange
  shares: MetricRange
}

export interface ActualMetrics {
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
}

export function rangeFromBaseline(baseline: number, spread = 0.45): MetricRange {
  const safe = Math.max(0, Math.round(baseline))
  const min = Math.max(0, Math.round(safe * (1 - spread)))
  const max = Math.max(min + 1, Math.round(safe * (1 + spread)))
  return { min, max }
}

export function buildPredictedMetrics(baseline: {
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
}): PredictedMetrics {
  return {
    views: rangeFromBaseline(baseline.views),
    likes: rangeFromBaseline(baseline.likes),
    comments: rangeFromBaseline(Math.max(baseline.comments, 1), 0.6),
    saves: rangeFromBaseline(baseline.saves),
    shares: rangeFromBaseline(baseline.shares),
  }
}

export function verdictForMetric(actual: number | null, range: MetricRange): PredictionVerdict | null {
  if (actual == null) return null
  if (actual >= range.min && actual <= range.max) return "hit"
  if (actual > range.max) return "over"
  return "under"
}

/** 任一核心指标落出区间 2 倍以上，视为系统性偏差。 */
export function isLargeDeviation(actual: ActualMetrics, predicted: PredictedMetrics): boolean {
  const pairs: Array<[number | null, MetricRange]> = [
    [actual.views, predicted.views],
    [actual.likes, predicted.likes],
    [actual.comments, predicted.comments],
    [actual.saves, predicted.saves],
    [actual.shares, predicted.shares],
  ]
  return pairs.some(([value, range]) => {
    if (value == null) return false
    if (value > range.max * 2) return true
    if (range.min > 0 && value < range.min / 2) return true
    return false
  })
}

export function overallVerdict(actual: ActualMetrics, predicted: PredictedMetrics): PredictionVerdict {
  const votes = [
    verdictForMetric(actual.views, predicted.views),
    verdictForMetric(actual.likes, predicted.likes),
    verdictForMetric(actual.comments, predicted.comments),
  ].filter((item): item is PredictionVerdict => Boolean(item))
  if (votes.length === 0) return "hit"
  if (votes.every((item) => item === "hit")) return "hit"
  const overs = votes.filter((item) => item === "over").length
  const unders = votes.filter((item) => item === "under").length
  if (overs > unders) return "over"
  if (unders > overs) return "under"
  return "hit"
}

export function predictionRequestId(generationId: string, windowDays: number): string {
  return `publish-prediction:${generationId}:${windowDays}`
}

export function deviationLearningRequestId(generationId: string, windowDays: number): string {
  return `prediction-deviation:${generationId}:${windowDays}`
}

export function renderPredictionRetroBlock(rows: Array<{
  windowDays: number
  viewsMin: number
  viewsMax: number
  actualViews: number | null
  verdict: string | null
}>): string {
  if (rows.length === 0) return ""
  const lines = ["=== 预测 vs 实际 ==="]
  for (const row of rows) {
    lines.push(
      `${row.windowDays} 天窗：预测播放 ${row.viewsMin}-${row.viewsMax}，实际 ${row.actualViews ?? "尚未回流"}，判定 ${row.verdict ?? "待对账"}`,
    )
  }
  return lines.join("\n")
}
