/**
 * 内容增长灰度进入下一档门禁（正本阶段 2）。
 * capture_only → evaluate → live：≥30 真实影子样本、连续 5 工作日无 P0/P1、严重虚构 0。
 */

export type ContentRolloutLevel = "capture_only" | "evaluate" | "live"

export interface ContentRolloutEvidence {
  shadowSampleCount: number
  consecutiveWorkdaysWithoutP0P1: number
  severeFabricationCount: number
  idempotentSuppressionObserved: boolean
  failureRetryableObserved: boolean
  currentLevel: ContentRolloutLevel
  targetLevel: ContentRolloutLevel
}

export interface ContentRolloutGateResult {
  ok: boolean
  reasons: string[]
  required: {
    minShadowSamples: number
    minWorkdays: number
    maxSevereFabrication: number
  }
}

export const CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES = 30
export const CONTENT_ROLLOUT_MIN_WORKDAYS = 5

const LEVEL_ORDER: Record<ContentRolloutLevel, number> = {
  capture_only: 0,
  evaluate: 1,
  live: 2,
}

/**
 * @description 判断是否允许从当前灰度档升到目标档
 */
export function assessContentRolloutPromotion(
  evidence: ContentRolloutEvidence,
): ContentRolloutGateResult {
  const required = {
    minShadowSamples: CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES,
    minWorkdays: CONTENT_ROLLOUT_MIN_WORKDAYS,
    maxSevereFabrication: 0,
  }
  const reasons: string[] = []

  if (LEVEL_ORDER[evidence.targetLevel] <= LEVEL_ORDER[evidence.currentLevel]) {
    return {
      ok: false,
      reasons: ["目标档位未高于当前档，无需晋升判定"],
      required,
    }
  }

  if (evidence.shadowSampleCount < required.minShadowSamples) {
    reasons.push(
      `影子样本 ${evidence.shadowSampleCount} < ${required.minShadowSamples}`,
    )
  }
  if (evidence.consecutiveWorkdaysWithoutP0P1 < required.minWorkdays) {
    reasons.push(
      `连续无 P0/P1 工作日 ${evidence.consecutiveWorkdaysWithoutP0P1} < ${required.minWorkdays}`,
    )
  }
  if (evidence.severeFabricationCount > required.maxSevereFabrication) {
    reasons.push(`严重虚构 ${evidence.severeFabricationCount} > 0`)
  }
  if (!evidence.idempotentSuppressionObserved) {
    reasons.push("尚未观察到幂等抑制有效样本")
  }
  if (!evidence.failureRetryableObserved) {
    reasons.push("尚未观察到失败可重试路径")
  }

  return { ok: reasons.length === 0, reasons, required }
}
