/**
 * 群聊选题「影子样本」：非 live 模式下跑完的真实入库事件。
 *
 * 人话：用真实群消息练手，但默认不写正式选题、不回群。
 * - capture_only：只记录/提取
 * - evaluate：可生成候选观察，仍不写正式选题、不回群
 * - live：正式闭环（不算影子）
 */

import {
  CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES,
  assessContentRolloutPromotion,
  type ContentRolloutEvidence,
  type ContentRolloutGateResult,
  type ContentRolloutLevel,
} from "@/lib/aim-harness/content-rollout-gate"
import { isExecutionMode, type ExecutionMode } from "@/lib/execution-mode"

export const SHADOW_EXECUTION_MODES = ["capture_only", "evaluate"] as const

export type ShadowExecutionMode = (typeof SHADOW_EXECUTION_MODES)[number]

export interface InspirationShadowRow {
  id: string
  source?: string | null
  sourceUrl?: string | null
  externalMessageId?: string | null
  dedupeKey?: string | null
  executionModeSnapshot?: string | null
  aiStatus?: string | null
  processingStage?: string | null
  topicSelectionId?: string | null
  replyStatus?: string | null
  createdAt?: Date | string | null
}

export interface ShadowSampleJudgement {
  isShadowSample: boolean
  mode: ExecutionMode | null
  reasons: string[]
}

/** 是否属于影子执行档（非 live）。缺快照时按 capture_only 兼容旧行。 */
export function resolveShadowExecutionMode(
  snapshot: string | null | undefined,
): ExecutionMode | null {
  if (snapshot == null || snapshot.trim() === "") return "capture_only"
  if (!isExecutionMode(snapshot)) return null
  return snapshot
}

/**
 * 一条 Inspiration 是否计为「真实影子样本」。
 * 要求：影子档 + 有外部消息/URL/去重键之一（证明来自真实渠道输入）+ 非明显空跑失败前丢弃。
 */
export function judgeInspirationShadowSample(row: InspirationShadowRow): ShadowSampleJudgement {
  const reasons: string[] = []
  const mode = resolveShadowExecutionMode(row.executionModeSnapshot)
  if (!mode) {
    return { isShadowSample: false, mode: null, reasons: ["executionModeSnapshot 非法"] }
  }
  if (mode === "live") {
    return { isShadowSample: false, mode, reasons: ["live 正式样本，不计影子"] }
  }

  const hasRealIngress = Boolean(
    row.externalMessageId?.trim() ||
      row.dedupeKey?.trim() ||
      row.sourceUrl?.trim() ||
      (row.source && row.source !== "text"),
  )
  if (!hasRealIngress) {
    reasons.push("缺少真实渠道痕迹（externalMessageId/dedupeKey/sourceUrl/非 text source）")
  }

  // 影子阶段不应落正式选题；若误写了仍可计样本，但记原因便于审计
  if (row.topicSelectionId) {
    reasons.push("影子行意外带有 topicSelectionId（应排查 live 误写）")
  }

  return {
    isShadowSample: hasRealIngress,
    mode,
    reasons,
  }
}

export function countShadowSamples(rows: InspirationShadowRow[]): {
  total: number
  byMode: Record<ShadowExecutionMode, number>
  remainingToGate: number
} {
  const byMode: Record<ShadowExecutionMode, number> = {
    capture_only: 0,
    evaluate: 0,
  }
  let total = 0
  for (const row of rows) {
    const judged = judgeInspirationShadowSample(row)
    if (!judged.isShadowSample || !judged.mode || judged.mode === "live") continue
    total += 1
    if (judged.mode === "capture_only" || judged.mode === "evaluate") {
      byMode[judged.mode] += 1
    }
  }
  return {
    total,
    byMode,
    remainingToGate: Math.max(0, CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES - total),
  }
}

/** 用影子计数填入晋升门禁证据（其余证据由调用方提供）。 */
export function buildRolloutEvidenceFromShadowCount(input: {
  shadowSampleCount: number
  consecutiveWorkdaysWithoutP0P1: number
  severeFabricationCount?: number
  idempotentSuppressionObserved?: boolean
  failureRetryableObserved?: boolean
  currentLevel: ContentRolloutLevel
  targetLevel: ContentRolloutLevel
}): { evidence: ContentRolloutEvidence; gate: ContentRolloutGateResult } {
  const evidence: ContentRolloutEvidence = {
    shadowSampleCount: input.shadowSampleCount,
    consecutiveWorkdaysWithoutP0P1: input.consecutiveWorkdaysWithoutP0P1,
    severeFabricationCount: input.severeFabricationCount ?? 0,
    idempotentSuppressionObserved: input.idempotentSuppressionObserved ?? false,
    failureRetryableObserved: input.failureRetryableObserved ?? false,
    currentLevel: input.currentLevel,
    targetLevel: input.targetLevel,
  }
  return { evidence, gate: assessContentRolloutPromotion(evidence) }
}

export function formatShadowSampleProgress(count: number): string {
  const need = CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES
  if (count >= need) return `影子样本已达门禁 ${count}/${need}`
  return `影子样本进度 ${count}/${need}（还差 ${need - count}）`
}
