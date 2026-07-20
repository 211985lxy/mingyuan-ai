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
const DEFAULT_LEASE_TTL_MS = 6 * 60_000

/**
 * @description planbackgroundtaskfailure
 * @param input - 输入数据
 * @returns 无返回值
 */
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

/**
 * @description enqueuebackgroundtask
 * @param prisma - prisma
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function enqueueBackgroundTask(
  prisma: PrismaClient,
  input: { kind: string; aggregateType: string; aggregateId: string; idempotencyKey: string; maxAttempts?: number; availableAt?: Date },
) {
  return prisma.backgroundTask.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: { ...input, maxAttempts: input.maxAttempts ?? 3, availableAt: input.availableAt ?? new Date() },
    update: {},
  })
}

/**
 * @description reclaimexpiredbackgroundtaskleases
 * @param prisma - prisma
 * @param now - now
 * @returns 无返回值
 */
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

/**
 * @description claimbackgroundtask
 * @param prisma - prisma
 * @param taskId - 任务 ID
 * @param now - now
 * @param leaseTtlMs - leaseTtlMs
 * @returns 无返回值
 */
export async function claimBackgroundTask(
  prisma: PrismaClient,
  taskId: string,
  now = new Date(),
  leaseTtlMs = DEFAULT_LEASE_TTL_MS,
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

/**
 * @description completebackgroundtask
 * @param prisma - prisma
 * @param taskId - 任务 ID
 * @param leaseToken - lease令牌
 * @param now - now
 * @returns 无返回值
 */
export async function completeBackgroundTask(prisma: PrismaClient, taskId: string, leaseToken: string, now = new Date()) {
  return prisma.backgroundTask.updateMany({
    where: { id: taskId, status: BACKGROUND_TASK_STATUS.leased, leaseToken },
    data: { status: BACKGROUND_TASK_STATUS.succeeded, completedAt: now, leaseToken: null, leaseExpiresAt: null },
  })
}

/**
 * @description deferbackgroundtask
 * @param prisma - prisma
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function deferBackgroundTask(
  prisma: PrismaClient,
  input: { taskId: string; leaseToken: string; availableAt: Date },
) {
  return prisma.backgroundTask.updateMany({
    where: { id: input.taskId, status: BACKGROUND_TASK_STATUS.leased, leaseToken: input.leaseToken },
    data: {
      status: BACKGROUND_TASK_STATUS.retryWait,
      availableAt: input.availableAt,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: null,
    },
  })
}

/**
 * @description failbackgroundtask
 * @param prisma - prisma
 * @param input - 输入数据
 * @returns 无返回值
 */
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
