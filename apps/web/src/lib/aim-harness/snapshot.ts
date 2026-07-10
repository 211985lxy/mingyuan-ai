/**
 * AIM Thin Harness v1 — snapshot + trace persistence.
 *
 * - persistAimRunSnapshot writes the full snapshot (runSpec, context manifest,
 *   provider attempts, full prompt, output, quality, image hashes) with a 30-day
 *   expiresAt. Admin-only on read; cleaned by cron/cleanup.
 * - applyRunMetadataToTrace stamps the long-term fields onto an existing
 *   AimExecutionTrace so provider/model/fallback/degraded/hashes/qualityStatus
 *   survive snapshot expiry.
 *
 * Both use the optional-delegate pattern from aim-observability so the harness
 * never hard-fails a generation if telemetry persistence is unavailable.
 */

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

import type { AimRunMetadata, AimRunSpec, AimContextSource } from "./types"

const SNAPSHOT_TTL_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface SnapshotInput {
  runSpec: AimRunSpec
  metadata: AimRunMetadata
  contextManifest: AimContextSource[]
  composedPrompt: string
  /** raw generated output (string or the domain response object) */
  output: unknown
  qualityResult?: unknown
  imageHashes?: Array<{ hash: string; type: string }>
  traceId?: string
  userId?: string | null
  projectId?: string | null
}

type SnapshotDelegate = {
  create(args: unknown): Promise<{ id: string }>
}

function getSnapshotDelegate(): SnapshotDelegate | undefined {
  return (prisma as typeof prisma & {
    aimRunSnapshot?: SnapshotDelegate
  }).aimRunSnapshot
}

/** Persist the full snapshot. Returns the snapshot id, or undefined on failure. */
export async function persistAimRunSnapshot(
  input: SnapshotInput
): Promise<string | undefined> {
  const delegate = getSnapshotDelegate()
  if (!delegate) return undefined

  const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_DAYS * MS_PER_DAY)

  try {
    const record = await delegate.create({
      data: {
        runId: input.metadata.runId,
        traceId: input.traceId ?? null,
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
        agentId: input.runSpec.agentId,
        action: input.runSpec.entrypoint,
        runSpec: input.runSpec as unknown as Record<string, unknown>,
        contextManifest: input.contextManifest,
        providerAttempts: input.metadata.providerAttempts,
        fullPrompt: input.composedPrompt,
        promptHash: input.metadata.promptHash,
        contextHash: input.metadata.contextHash,
        output:
          typeof input.output === "string"
            ? input.output
            : JSON.stringify(input.output ?? null),
        outputFormats: input.runSpec.outputFormats,
        qualityResult: input.qualityResult ?? null,
        imageHashes: input.imageHashes ?? [],
        provider: input.metadata.provider,
        model: input.metadata.model,
        fallbackIndex: input.metadata.fallbackIndex,
        degraded: input.metadata.degraded,
        expiresAt,
      },
    })
    return record.id
  } catch (error) {
    logger.warn({ error, runId: input.metadata.runId }, "[aim-harness] snapshot persist failed")
    return undefined
  }
}

type TraceDelegate = {
  update(args: unknown): Promise<unknown>
}

function getTraceDelegate(): TraceDelegate | undefined {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: TraceDelegate
  }).aimExecutionTrace
}

/** Stamp run metadata onto an existing trace (long-term fields). */
export async function applyRunMetadataToTrace(
  traceId: string | undefined,
  metadata: AimRunMetadata,
  snapshotId?: string,
  qualityStatus?: string
): Promise<void> {
  if (!traceId) return
  const delegate = getTraceDelegate()
  if (!delegate) return
  try {
    await delegate.update({
      where: { id: traceId },
      data: {
        runId: metadata.runId,
        provider: metadata.provider,
        fallbackIndex: metadata.fallbackIndex,
        degraded: metadata.degraded,
        harnessVersion: metadata.harnessVersion,
        promptHash: metadata.promptHash,
        contextHash: metadata.contextHash,
        qualityStatus: qualityStatus ?? null,
        snapshotId: snapshotId ?? null,
      },
    })
  } catch (error) {
    logger.warn({ error, traceId, runId: metadata.runId }, "[aim-harness] trace metadata stamp failed")
  }
}
