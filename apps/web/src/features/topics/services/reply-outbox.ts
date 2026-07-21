/**
 * Reply Outbox service for async platform reply delivery.
 *
 * Decouples reply creation from reply sending. All platforms (Feishu, WeCom,
 * WorkBuddy) write into the ChannelReplyOutbox table; a background task
 * handles Feishu delivery internally, while external agents claim/ack for
 * WeCom and WorkBuddy.
 */

import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { InspirationPipelineError } from "@/lib/inspiration-pipeline-error"

export const OUTBOX_SEND_TASK_KIND = "inspiration_outbox_send"

export type ReplyType = "accepted" | "final" | "already_collected" | "error"
export type OutboxStatus = "pending" | "sending" | "sent" | "retry_wait" | "dead_letter" | "suppressed"

export const MAX_OUTBOX_ATTEMPTS = 5
const CLAIM_LEASE_DURATION_MS = 5 * 60_000 // 5 minutes

/** Exponential backoff schedule for outbox retry attempts (ms). */
const OUTBOX_RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000]

/** Compute the next availableAt timestamp for an outbox reply after a failed attempt. */
export function computeOutboxRetryAvailableAt(attempt: number, now: Date = new Date()): Date {
  const delay = OUTBOX_RETRY_BACKOFF_MS[Math.min(attempt - 1, OUTBOX_RETRY_BACKOFF_MS.length - 1)]
  return new Date(now.getTime() + delay)
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export interface EnqueueReplyInput {
  inspirationId: string
  replyType: ReplyType
  platform: string
  externalAccountId?: string
  externalChatId: string
  externalMessageId?: string
  replyText: string
  /** Skip enqueueing a background task (e.g., when suppressed or for accepted replies that are sent inline). */
  skipBackgroundTask?: boolean
}

/**
 * Create or update (upsert) a ChannelReplyOutbox record by inspirationId + replyType,
 * and optionally enqueue a background task for internal delivery (Feishu).
 *
 * If a record already exists for this (inspirationId, replyType) pair, only the
 * replyText is updated and the status is reset to "pending" so it can be re-delivered.
 * This provides idempotency: calling enqueueReply twice with the same key won't
 * create duplicates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * @description 入队reply（幂等upsert）
 * @param input - 输入数据
 * @param tx? - tx?
 * @returns 无返回值
 */
export async function enqueueReply(input: EnqueueReplyInput, tx?: any) {
  const client = tx ?? prisma
  const dedupeKey = `${input.inspirationId}:${input.replyType}`
  const outbox = await client.channelReplyOutbox.upsert({
    where: { inspirationId_replyType: { inspirationId: input.inspirationId, replyType: input.replyType } },
    create: {
      inspirationId: input.inspirationId,
      replyType: input.replyType,
      platform: input.platform,
      externalAccountId: input.externalAccountId,
      externalChatId: input.externalChatId,
      externalMessageId: input.externalMessageId,
      replyText: input.replyText,
      status: "pending",
    },
    update: {
      replyText: input.replyText,
      status: "pending",
      claimToken: null,
      claimExpiresAt: null,
      lastError: null,
    },
  })

  // Only enqueue a background task for internal platforms (Feishu) that need
  // async sending. External platforms (wecom, workbuddy_wechat) are claimed
  // by their agents via the claim endpoint.
  if (!input.skipBackgroundTask && input.platform === "feishu") {
    await enqueueBackgroundTask(tx ?? (prisma as never), {
      kind: OUTBOX_SEND_TASK_KIND,
      aggregateType: "channel_reply_outbox",
      aggregateId: outbox.id,
      idempotencyKey: `outbox-send:${dedupeKey}`,
      maxAttempts: MAX_OUTBOX_ATTEMPTS,
    })
  }

  return outbox
}

// ---------------------------------------------------------------------------
// Claim (for external agents — wecom, workbuddy_wechat)
// ---------------------------------------------------------------------------

export interface ClaimOutboxRepliesInput {
  userId: string
  allowedProjects: string[]
  platform: string
  limit?: number
}

/**
 * Claim pending outbox replies for an external agent.
 * Atomically transitions records from `pending` → `sending` with a claim token.
 */
/**
 * @description 领取outboxreplies
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function claimOutboxReplies(input: ClaimOutboxRepliesInput) {
  const limit = Math.min(10, Math.max(1, input.limit ?? 5))
  const staleAt = new Date(Date.now() - CLAIM_LEASE_DURATION_MS)

  return prisma.$transaction(async (tx) => {
    // Reset stale claims back to pending
    await tx.channelReplyOutbox.updateMany({
      where: {
        status: "sending",
        claimExpiresAt: { lte: staleAt },
        platform: input.platform,
      },
      data: { status: "pending", claimToken: null, claimExpiresAt: null },
    })

    // Find candidates — join through Inspiration to verify ownership
    const candidates = await tx.channelReplyOutbox.findMany({
      where: {
        platform: input.platform,
        status: "pending",
        attempts: { lt: MAX_OUTBOX_ATTEMPTS },
        // Only claim replies whose availableAt has passed (or was never set)
        availableAt: { lte: new Date() },
        inspiration: {
          userId: input.userId,
          projectId: { in: input.allowedProjects },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    })

    const claimed: Array<{ id: string; claimToken: string; platform: string; externalChatId: string; externalMessageId: string | null; replyText: string; replyType: string }> = []

    for (const candidate of candidates) {
      const claimToken = randomUUID()
      const result = await tx.channelReplyOutbox.updateMany({
        where: { id: candidate.id, status: "pending" },
        data: {
          status: "sending",
          attempts: { increment: 1 },
          claimToken,
          claimExpiresAt: new Date(Date.now() + CLAIM_LEASE_DURATION_MS),
          lastError: null,
        },
      })
      if (result.count === 1) {
        claimed.push({
          id: candidate.id,
          claimToken,
          platform: candidate.platform,
          externalChatId: candidate.externalChatId,
          externalMessageId: candidate.externalMessageId,
          replyText: candidate.replyText,
          replyType: candidate.replyType,
        })
      }
    }

    return claimed
  }, { isolationLevel: "ReadCommitted" })
}

// ---------------------------------------------------------------------------
// Acknowledge (for external agents)
// ---------------------------------------------------------------------------

export interface AcknowledgeOutboxReplyInput {
  userId: string
  allowedProjects: string[]
  replyId: string
  claimToken: string
  sent: boolean
  errorMessage?: string
}

/**
 * Acknowledge an outbox reply after an external agent has attempted delivery.
 *
 * Idempotent: if the reply is already in "sent" status (e.g., duplicate ack
 * from the external gateway), returns true without modifying the record.
 */
/**
 * @description 确认outboxreply
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function acknowledgeOutboxReply(input: AcknowledgeOutboxReplyInput) {
  // First verify ownership through the Inspiration relation
  const outbox = await prisma.channelReplyOutbox.findUnique({
    where: { id: input.replyId },
    include: { inspiration: { select: { userId: true, projectId: true } } },
  })
  if (!outbox) return false
  if (outbox.inspiration.userId !== input.userId || !outbox.inspiration.projectId || !input.allowedProjects.includes(outbox.inspiration.projectId)) {
    return false
  }

  // Idempotent: already sent — treat as success
  if (outbox.status === "sent") return true

  const data = input.sent
    ? { status: "sent" as const, sentAt: new Date(), claimToken: null, claimExpiresAt: null, lastError: null }
    : { status: "retry_wait" as const, claimToken: null, claimExpiresAt: null, lastError: input.errorMessage || "外部平台发送失败" }

  const result = await prisma.channelReplyOutbox.updateMany({
    where: { id: input.replyId, status: "sending", claimToken: input.claimToken },
    data,
  })
  return result.count === 1
}

// ---------------------------------------------------------------------------
// Internal send (Feishu)
// ---------------------------------------------------------------------------

/**
 * Send a single outbox reply internally (Feishu only).
 * Claimed by the background task executor.
 *
 * Throws InspirationPipelineError on all failure conditions — never returns false.
 */
/**
 * @description 发送outboxreply
 * @param replyId - reply唯一标识符
 * @returns Promise<void>
 */
export async function sendOutboxReply(replyId: string): Promise<void> {
  const reply = await prisma.channelReplyOutbox.findUnique({ where: { id: replyId } })
  if (!reply) throw new InspirationPipelineError("INSPIRATION_NOT_FOUND")
  if (reply.platform !== "feishu") throw new InspirationPipelineError("REPLY_PLATFORM_NOT_INTERNAL")
  if (!reply.externalMessageId) throw new InspirationPipelineError("REPLY_SEND_FAILED", { internalDetails: "缺少 externalMessageId" })

  // Dynamically import to avoid circular deps at module level
  const { getFeishuTenantAccessToken, replyFeishuTextMessage } = await import("@/lib/integrations/feishu-topic-chat")
  const { env } = await import("@/env")

  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) throw new InspirationPipelineError("REPLY_SEND_FAILED", { internalDetails: "飞书 App 凭证未配置" })

  const tenantAccessToken = await getFeishuTenantAccessToken({ appId: env.FEISHU_APP_ID, appSecret: env.FEISHU_APP_SECRET })
  await replyFeishuTextMessage({
    messageId: reply.externalMessageId,
    text: reply.replyText,
    tenantAccessToken,
    idempotencyKey: `outbox-${reply.replyType}-${reply.id}`,
  })
}

// ---------------------------------------------------------------------------
// Dead letter advancement
// ---------------------------------------------------------------------------

/**
 * Move outbox replies that have exceeded maxAttempts from `retry_wait` → `dead_letter`.
 * Called periodically by the outbox background task.
 */
/**
 * @description 推进deadletters
 * @returns 无返回值
 */
export async function advanceDeadLetters() {
  const result = await prisma.channelReplyOutbox.updateMany({
    where: {
      status: "retry_wait",
      attempts: { gte: MAX_OUTBOX_ATTEMPTS },
    },
    data: { status: "dead_letter", availableAt: null },
  })
  return result.count
}
