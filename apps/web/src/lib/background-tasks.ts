import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@/generated/prisma/client"

export const BACKGROUND_TASK_STATUS = {
  queued: "queued",
  leased: "leased",
  retryWait: "retry_wait",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
} as const

const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000]

export function planBackgroundTaskFailure(input: {
  attempt: number
  maxAttempts: number
  retryable: boolean
  now: Date
}) {
  if (!input.retryable || input.attempt >= input.maxAttempts) {
    return { status: BACKGROUND_TASK_STATUS.failed, availableAt: null }
  }
  const delay = RETRY_BACKOFF_MS[Math.min(input.attempt - 1, RETRY_BACKOFF_MS.length - 1)]
  return {
    status: BACKGROUND_TASK_STATUS.retryWait,
    availableAt: new Date(input.now.getTime() + delay),
  }
}

export async function enqueueBackgroundTask(
  prisma: PrismaClient,
  input: { kind: string; aggregateType: string; aggregateId: string; idempotencyKey: string; maxAttempts?: number },
) {
  return prisma.backgroundTask.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: { ...input, maxAttempts: input.maxAttempts ?? 3 },
    update: {},
  })
}

export async function reclaimExpiredBackgroundTaskLeases(prisma: PrismaClient, now = new Date()) {
  return prisma.backgroundTask.updateMany({
    where: { status: BACKGROUND_TASK_STATUS.leased, leaseExpiresAt: { lte: now } },
    data: {
      status: BACKGROUND_TASK_STATUS.retryWait,
      availableAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: "执行租约到期，等待恢复。",
    },
  })
}

export async function claimBackgroundTask(
  prisma: PrismaClient,
  taskId: string,
  now = new Date(),
  leaseTtlMs = 5 * 60_000,
) {
  const leaseToken = randomUUID()
  const leaseExpiresAt = new Date(now.getTime() + leaseTtlMs)
  const claimed = await prisma.backgroundTask.updateMany({
    where: {
      id: taskId,
      status: { in: [BACKGROUND_TASK_STATUS.queued, BACKGROUND_TASK_STATUS.retryWait] },
      availableAt: { lte: now },
    },
    data: { status: BACKGROUND_TASK_STATUS.leased, leaseToken, leaseExpiresAt, attempt: { increment: 1 } },
  })
  if (claimed.count !== 1) return null
  return prisma.backgroundTask.findUnique({ where: { leaseToken } })
}

export async function completeBackgroundTask(prisma: PrismaClient, taskId: string, leaseToken: string, now = new Date()) {
  return prisma.backgroundTask.updateMany({
    where: { id: taskId, status: BACKGROUND_TASK_STATUS.leased, leaseToken },
    data: { status: BACKGROUND_TASK_STATUS.succeeded, completedAt: now, leaseToken: null, leaseExpiresAt: null },
  })
}

export async function failBackgroundTask(
  prisma: PrismaClient,
  input: { taskId: string; leaseToken: string; attempt: number; maxAttempts: number; retryable: boolean; error: string; now?: Date },
) {
  const plan = planBackgroundTaskFailure({ ...input, now: input.now ?? new Date() })
  return prisma.backgroundTask.updateMany({
    where: { id: input.taskId, status: BACKGROUND_TASK_STATUS.leased, leaseToken: input.leaseToken },
    data: {
      status: plan.status,
      availableAt: plan.availableAt ?? undefined,
      completedAt: plan.status === BACKGROUND_TASK_STATUS.failed ? input.now ?? new Date() : null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: input.error,
    },
  })
}
