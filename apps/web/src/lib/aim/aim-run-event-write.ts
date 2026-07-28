import type { Prisma } from "@/generated/prisma/client"
import { parseRunOutcomeMetadata } from "@/lib/aim/run-outcome-telemetry"

type TraceCost = { durationMs: number | null; costCny: { toString(): string } | number | null }

export function buildAimRunEventMetadata(input: {
  bodyMetadata: Record<string, unknown> | undefined
  reason?: string
  runId: string
  trace: TraceCost
}): Record<string, unknown> {
  const metadata = { ...(input.bodyMetadata ?? {}) }
  if (input.reason) metadata.reason = input.reason
  if (metadata.durationMs == null && input.trace.durationMs != null) {
    metadata.durationMs = input.trace.durationMs
  }
  if (metadata.costCny == null && input.trace.costCny != null) {
    metadata.costCny = Number(input.trace.costCny)
  }
  metadata.runId = input.runId
  return metadata
}

export function findDuplicateEventByRequestId(
  recent: Array<{ id: string; metadata: unknown }>,
  requestId: string,
): { id: string } | null {
  const hit = recent.find((row) => {
    const meta = row.metadata
    return Boolean(
      meta
      && typeof meta === "object"
      && !Array.isArray(meta)
      && (meta as Record<string, unknown>).requestId === requestId,
    )
  })
  return hit ? { id: hit.id } : null
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
