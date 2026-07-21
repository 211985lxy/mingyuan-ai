/**
 * Background task executor for sending outbox replies (Feishu internal delivery).
 */

import { claimBackgroundTask, completeBackgroundTask, failBackgroundTask } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { sendOutboxReply, OUTBOX_SEND_TASK_KIND, MAX_OUTBOX_ATTEMPTS, computeOutboxRetryAvailableAt } from "./reply-outbox"
import { recordChannelMetric } from "@/lib/channel-metrics"

/**
 * @description 执行outboxsendbackgroundtask
 * @param taskId - 任务 ID
 * @returns 无返回值
 */
export async function executeOutboxSendBackgroundTask(taskId: string) {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  try {
    await sendOutboxReply(task.aggregateId)
    // Fetch platform context for metrics before updating
    const reply = await prisma.channelReplyOutbox.findUnique({ where: { id: task.aggregateId }, select: { platform: true, externalChatId: true } })
    await prisma.channelReplyOutbox.update({
      where: { id: task.aggregateId },
      data: { status: "sent", sentAt: new Date(), claimToken: null, claimExpiresAt: null, lastError: null },
    })
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
    if (reply?.platform) recordChannelMetric({ metric: "reply_sent", platform: reply.platform, externalChatId: reply.externalChatId ?? undefined }).catch(() => {})
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isFailed = task.attempt >= MAX_OUTBOX_ATTEMPTS

    // Fetch platform context for metrics before updating
    const reply = await prisma.channelReplyOutbox.findUnique({ where: { id: task.aggregateId }, select: { platform: true, externalChatId: true } })
    await prisma.channelReplyOutbox.update({
      where: { id: task.aggregateId },
      data: {
        status: isFailed ? "dead_letter" : "retry_wait",
        claimToken: null,
        claimExpiresAt: null,
        availableAt: isFailed ? null : computeOutboxRetryAvailableAt(task.attempt),
        lastError: message,
      },
    })

    if (isFailed && reply?.platform) recordChannelMetric({ metric: "reply_dead_letter", platform: reply.platform, externalChatId: reply.externalChatId ?? undefined }).catch(() => {})

    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable: !isFailed,
      error: message,
    })

    return true
  }
}
