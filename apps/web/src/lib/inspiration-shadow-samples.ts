/**
 * 群聊选题「影子样本」：非 live 模式下跑完的真实入库事件。
 *
 * 人话：用真实群消息练手，但默认不写正式选题、不回群。
 * - 仅显式 executionModeSnapshot ∈ capture_only|evaluate 可计入放量门槛
 * - 缺失/非法快照、正式选题写入、未抑制外发均不计样本，并计入违规统计
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
  /** 缺失或非法 executionModeSnapshot */
  invalidMode: boolean
  /** 影子档却写入正式选题 */
  formalWriteViolation: boolean
  /** 影子档却未抑制外发 */
  replyViolation: boolean
}

export interface ShadowSampleCountResult {
  total: number
  byMode: Record<ShadowExecutionMode, number>
  remainingToGate: number
  invalidCount: number
  formalWriteViolationCount: number
  replyViolationCount: number
}

export function emptyShadowSampleCount(): ShadowSampleCountResult {
  return {
    total: 0,
    byMode: { capture_only: 0, evaluate: 0 },
    remainingToGate: CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES,
    invalidCount: 0,
    formalWriteViolationCount: 0,
    replyViolationCount: 0,
  }
}

/** 仅接受显式 capture_only|evaluate|live；缺失或非法返回 null（旧行不得计入门禁）。 */
export function resolveShadowExecutionMode(
  snapshot: string | null | undefined,
): ExecutionMode | null {
  if (snapshot == null || snapshot.trim() === "") return null
  if (!isExecutionMode(snapshot)) return null
  return snapshot
}

function hasRealChannelIngress(row: InspirationShadowRow): boolean {
  return Boolean(
    row.externalMessageId?.trim() ||
      row.dedupeKey?.trim() ||
      row.sourceUrl?.trim() ||
      (row.source && row.source !== "text"),
  )
}

function isShadowMode(mode: ExecutionMode | null): mode is ShadowExecutionMode {
  return mode === "capture_only" || mode === "evaluate"
}

/**
 * 一条 Inspiration 是否计为「真实影子样本」。
 * 要求：显式影子档 + 真实渠道痕迹 + 无正式选题 + replyStatus=suppressed。
 */
export function judgeInspirationShadowSample(row: InspirationShadowRow): ShadowSampleJudgement {
  const reasons: string[] = []
  const mode = resolveShadowExecutionMode(row.executionModeSnapshot)
  const realIngress = hasRealChannelIngress(row)
  const formalWriteViolation = Boolean(row.topicSelectionId)
  const replyViolation = row.replyStatus !== "suppressed"

  if (!mode) {
    if (realIngress) {
      reasons.push("executionModeSnapshot 缺失或非法，不计影子门禁")
    }
    return {
      isShadowSample: false,
      mode: null,
      reasons,
      invalidMode: realIngress,
      formalWriteViolation: false,
      replyViolation: false,
    }
  }

  if (mode === "live") {
    return {
      isShadowSample: false,
      mode,
      reasons: ["live 正式样本，不计影子"],
      invalidMode: false,
      formalWriteViolation: false,
      replyViolation: false,
    }
  }

  if (!realIngress) {
    reasons.push("缺少真实渠道痕迹（externalMessageId/dedupeKey/sourceUrl/非 text source）")
  }

  if (formalWriteViolation) {
    reasons.push("影子行带有 topicSelectionId（正式写入违规）")
  }

  if (replyViolation) {
    reasons.push("影子行 replyStatus 非 suppressed（外发违规）")
  }

  const isShadowSample =
    isShadowMode(mode) && realIngress && !formalWriteViolation && !replyViolation

  return {
    isShadowSample,
    mode,
    reasons,
    invalidMode: false,
    formalWriteViolation: isShadowMode(mode) && realIngress && formalWriteViolation,
    replyViolation: isShadowMode(mode) && realIngress && replyViolation,
  }
}

export function countShadowSamples(rows: InspirationShadowRow[]): ShadowSampleCountResult {
  const byMode: Record<ShadowExecutionMode, number> = {
    capture_only: 0,
    evaluate: 0,
  }
  let total = 0
  let invalidCount = 0
  let formalWriteViolationCount = 0
  let replyViolationCount = 0

  for (const row of rows) {
    const judged = judgeInspirationShadowSample(row)
    if (judged.invalidMode) invalidCount += 1
    if (judged.formalWriteViolation) formalWriteViolationCount += 1
    if (judged.replyViolation) replyViolationCount += 1
    if (!judged.isShadowSample || !isShadowMode(judged.mode)) continue
    total += 1
    byMode[judged.mode] += 1
  }

  return {
    total,
    byMode,
    remainingToGate: Math.max(0, CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES - total),
    invalidCount,
    formalWriteViolationCount,
    replyViolationCount,
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
