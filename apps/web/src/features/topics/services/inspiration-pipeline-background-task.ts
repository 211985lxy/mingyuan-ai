import {
  claimBackgroundTask,
  completeBackgroundTask,
  deferBackgroundTask,
  failBackgroundTask,
  planBackgroundTaskFailure,
} from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { processInspirationPipeline } from "./inspiration-pipeline"
import { isPipelineRetryable, formatPipelineUserMessage } from "@/lib/inspiration-pipeline-error"
import { enqueueReply } from "./reply-outbox"
import { recordChannelMetric } from "@/lib/channel-metrics"

/**
 * @description 执行inspirationpipelinebackgroundtask
 * @param taskId - 任务 ID
 * @returns 无返回值
 */
export async function executeInspirationPipelineBackgroundTask(taskId: string) {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false
  try {
    const result = await processInspirationPipeline(task.aggregateId)
    if (result.outcome === "deferred") {
      await deferBackgroundTask(prisma, {
        taskId: task.id,
        leaseToken: task.leaseToken!,
        availableAt: new Date(Date.now() + 30_000),
      })
      return true
    }
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
    // Record pipeline success metric
    const successInsp = await prisma.inspiration.findUnique({ where: { id: task.aggregateId }, select: { source: true, externalChatId: true, externalAccountId: true } })
    if (successInsp?.source) recordChannelMetric({ metric: "pipeline_completed", platform: successInsp.source, externalChatId: successInsp.externalChatId ?? undefined, externalAccountId: successInsp.externalAccountId ?? undefined }).catch(() => {})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const retryable = isPipelineRetryable(error)
    const plan = planBackgroundTaskFailure({ attempt: task.attempt, maxAttempts: task.maxAttempts, retryable, now: new Date() })
    if (plan.status === "failed") {
      // Fetch inspiration for platform context
      const inspiration = await prisma.inspiration.findUnique({
        where: { id: task.aggregateId },
        select: { source: true, externalChatId: true, externalMessageId: true, externalAccountId: true },
      })
      await prisma.$transaction(async (tx) => {
        await tx.inspiration.updateMany({
          where: { id: task.aggregateId, aiStatus: { not: "completed" } },
          data: { aiStatus: "failed", processingStage: "failed", errorMessage: message },
        })
        // Create outbox error reply
        if (inspiration?.source) {
          const userMessage = formatPipelineUserMessage(error)
          await enqueueReply({
            inspirationId: task.aggregateId,
            replyType: "error",
            platform: inspiration.source,
            externalAccountId: inspiration.externalAccountId || undefined,
            externalChatId: inspiration.externalChatId || "",
            externalMessageId: inspiration.externalMessageId ?? undefined,
            replyText: userMessage,
            skipBackgroundTask: false,
          }, tx as never)
        }
      })
      // Record pipeline failure metric
      if (inspiration?.source) recordChannelMetric({ metric: "pipeline_failed", platform: inspiration.source, externalChatId: inspiration.externalChatId ?? undefined, externalAccountId: undefined }).catch(() => {})
    }
    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable,
      error: message,
    })
  }
  return true
}
