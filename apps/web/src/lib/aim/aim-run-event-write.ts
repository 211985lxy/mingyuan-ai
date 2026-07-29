import type { Prisma } from "@/generated/prisma/client"
import {
  parseRunOutcomeMetadata,
  type RunOutcomeChannel,
} from "@/lib/aim/run-outcome-telemetry"

type TraceCost = {
  durationMs: number | null
  totalTokens: number | null
  costCny: { toString(): string } | number | null
}

export function buildAimRunEventMetadata(input: {
  bodyMetadata: Record<string, unknown> | undefined
  reason?: string
  runId: string
  trace: TraceCost
  expectedChannel?: RunOutcomeChannel
}): Record<string, unknown> {
  const metadata = { ...(input.bodyMetadata ?? {}) }
  if (input.reason) metadata.reason = input.reason
  metadata.durationMs = input.trace.durationMs
  metadata.totalTokens = input.trace.totalTokens
  metadata.costCny = input.trace.costCny == null ? null : Number(input.trace.costCny)
  if (input.expectedChannel) metadata.channel = input.expectedChannel
  metadata.runId = input.runId
  return metadata
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "P2002",
  )
}

export function validateFinalDispositionEvent(
  event: string,
  metadata: Record<string, unknown>,
): string | null {
  if (event !== "final_disposition") return null
  if (parseRunOutcomeMetadata(metadata)) return null
  return "final_disposition 缺少完整 RunOutcomeMetadata"
}

export function toPrismaJson(metadata: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  return Object.keys(metadata).length > 0 ? (metadata as Prisma.InputJsonValue) : undefined
}

export function buildStructuredOutcomeColumns(metadata: Record<string, unknown>) {
  const outcome = parseRunOutcomeMetadata(metadata)
  if (!outcome) return {}
  return {
    workflowId: outcome.workflowId,
    taskType: outcome.taskType,
    finalDisposition: outcome.finalDisposition,
    humanActiveMinutes: outcome.humanActiveMinutes,
    manualBaselineMinutes: outcome.manualBaselineMinutes ?? null,
    reasonCode: outcome.reasonCode ?? null,
    channel: outcome.channel,
    requestId: outcome.requestId,
  }
}
