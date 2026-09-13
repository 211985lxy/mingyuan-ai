/**
 * 发布前预测与对账（WP-A3）纯逻辑层。
 *
 * 为什么做预测：学习闭环此前只有"感知臂"（自动评估/提醒），没有"执行臂"。
 * 预测是最轻的执行臂——发布登记时系统先表态，效果回流后对账可证伪，
 * 系统性偏差自动变成学习候选（人批后注入），全程无对外副作用。
 *
 * 只预测播放口径：它是 WP-1.1 自动回流唯一稳定可得的内容信号；
 * 商业结果（线索/成交）永远留给人，不猜（数据纪律，与主计划一致）。
 */

import { createHash } from "node:crypto"

export type PredictionConfidence = "low" | "medium" | "high"
export type PredictionVerdict = "within" | "over" | "under"

export interface AccountBaseline {
  /** 参与基线计算的历史作品数（决定置信度） */
  sampleSize: number
  /** 近窗口作品的播放四分位（来自 AccountWorkAsset 快照） */
  p25Views: number
  medianViews: number
  p75Views: number
}

export interface PredictionRange {
  low: number
  high: number
  confidence: PredictionConfidence
  rationaleDigest: string
  baselineHash: string
}

/** 窗口越长累计播放越高；系数是保守的次线性假设，宁可区间窄也不拍脑袋放大。 */
const WINDOW_FACTORS: Record<number, number> = { 7: 1, 14: 1.4, 30: 1.8 }

export function buildBaselinePrediction(
  baseline: AccountBaseline,
  windowDay: number,
  hashInput: string,
  metricLabel = "播放",
): PredictionRange {
  const factor = WINDOW_FACTORS[windowDay] ?? 1
  const low = Math.max(0, Math.floor(baseline.p25Views * factor))
  const high = Math.max(low + 1, Math.ceil(baseline.p75Views * factor))
  const confidence: PredictionConfidence =
    baseline.sampleSize >= 10 ? "high" : baseline.sampleSize >= 5 ? "medium" : "low"
  const digest = [
    `账号基线：最近 ${baseline.sampleSize} 条作品的${metricLabel}四分位 P25=${baseline.p25Views} / 中位=${baseline.medianViews} / P75=${baseline.p75Views}。`,
    `${windowDay} 天窗口预测区间 [${low}, ${high}]（置信度 ${confidence}）：区间来自账号真实历史，不是拍脑袋。`,
    metricLabel === "点赞" ? "注：抖音不对外公开播放量，本预测按点赞口径。" : "",
  ]
    .filter(Boolean)
    .join("\n")
  return { low, high, confidence, rationaleDigest: digest, baselineHash: sha256Hex(`${hashInput}:${digest}`) }
}

export interface ReconciliationResult {
  verdict: PredictionVerdict
  /** 实际 / 预测中位；中位为 0 时返回 null（无基线不计算比率） */
  deviationRatio: number | null
}

export function reconcilePrediction(prediction: { low: number; high: number }, actualViews: number): ReconciliationResult {
  const mid = (prediction.low + prediction.high) / 2
  const verdict: PredictionVerdict =
    actualViews > prediction.high ? "over" : actualViews < prediction.low ? "under" : "within"
  return {
    verdict,
    deviationRatio: mid > 0 ? Math.round((actualViews / mid) * 10000) / 10000 : null,
  }
}

export interface ReconciledOutcome {
  windowDay: number
  verdict: PredictionVerdict
  deviationRatio: number | null
}

export interface BiasCandidateDraft {
  targetType: "methodology_revision"
  failureCode: "prediction_bias_over" | "prediction_bias_under"
  payload: {
    windowDay: number
    sample: number
    overCount: number
    underCount: number
    medianDeviationRatio: number | null
    summary: string
  }
}

const BIAS_MIN_SAMPLE = 3
const BIAS_MIN_RATIO_GAP = 0.5 // 偏离中位 ≥50% 才算系统性偏差

/**
 * 系统性偏差检测：同窗口 ≥3 条对账、且同向偏离占多数、中位偏离 ≥50%
 * → 生成 methodology_revision 学习候选草稿（幂等键由调用方拼：projectId+window+方向+周桶）。
 * 检测纯函数化，方便 eval 与单测锁行为。
 */
export function detectSystematicBias(reconciled: ReconciledOutcome[]): BiasCandidateDraft[] {
  const byWindow = new Map<number, ReconciledOutcome[]>()
  for (const item of reconciled) {
    const list = byWindow.get(item.windowDay) ?? []
    list.push(item)
    byWindow.set(item.windowDay, list)
  }

  const drafts: BiasCandidateDraft[] = []
  for (const [windowDay, list] of byWindow) {
    const scored = list.filter((item) => item.deviationRatio !== null)
    if (scored.length < BIAS_MIN_SAMPLE) continue
    const over = scored.filter((item) => item.verdict === "over")
    const under = scored.filter((item) => item.verdict === "under")
    const majority: "over" | "under" | null =
      over.length > under.length && over.length >= Math.ceil(scored.length / 2)
        ? "over"
        : under.length > over.length && under.length >= Math.ceil(scored.length / 2)
          ? "under"
          : null
    if (!majority) continue

    const ratios = scored
      .map((item) => item.deviationRatio as number)
      .sort((a, b) => a - b)
    const median =
      ratios.length % 2 === 1
        ? ratios[(ratios.length - 1) / 2]
        : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2
    if (Math.abs(median - 1) < BIAS_MIN_RATIO_GAP) continue

    drafts.push({
      targetType: "methodology_revision",
      failureCode: majority === "over" ? "prediction_bias_over" : "prediction_bias_under",
      payload: {
        windowDay,
        sample: scored.length,
        overCount: over.length,
        underCount: under.length,
        medianDeviationRatio: Math.round(median * 10000) / 10000,
        summary:
          majority === "over"
            ? `${windowDay} 天窗口预测系统性高估：${over.length}/${scored.length} 条实际超出预测上界（中位偏离 ${median.toFixed(2)}x），建议下调该窗口区间系数或复核基线口径。`
            : `${windowDay} 天窗口预测系统性低估：${under.length}/${scored.length} 条实际低于预测下界（中位偏离 ${median.toFixed(2)}x），建议上调该窗口区间系数或检查账号是否进入上升期。`,
      },
    })
  }
  return drafts
}

/** 幂等键：同项目+同窗口+同方向+同一自然周（周一为起点，对齐周报口径）只建一条候选。 */
export function biasCandidateRequestId(
  projectId: string | null,
  draft: BiasCandidateDraft,
  at: Date,
): string {
  const weekStart = new Date(at)
  weekStart.setUTCHours(0, 0, 0, 0)
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday)
  return `prediction-bias:${projectId ?? "none"}:${draft.payload.windowDay}:${draft.failureCode}:${weekStart.toISOString().slice(0, 10)}`
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}
