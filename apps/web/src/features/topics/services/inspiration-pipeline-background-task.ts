import {
  claimBackgroundTask,
  completeBackgroundTask,
  deferBackgroundTask,
  failBackgroundTask,
  planBackgroundTaskFailure,
} from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import {
  ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE,
  accountProjectContextStaleErrorString,
  assertAccountProjectExecutionContext,
  isAccountProjectContextError,
  logAccountProjectContextRejection,
} from "@/lib/account-project-context"
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

  // ── Re-validate account-project binding before any model call / write ──
  // If the account's bound project changed after the task was queued, fail
  // without calling the model. The mismatch is not recoverable.
  const owner = await prisma.inspiration.findUnique({
    where: { id: task.aggregateId },
    select: { userId: true, projectId: true },
  })
  if (owner) {
    try {
      await assertAccountProjectExecutionContext({
        userId: owner.userId,
        projectId: owner.projectId ?? "",
        source: "inspiration",
      })
    } catch (error) {
      if (isAccountProjectContextError(error)) {
        await logAccountProjectContextRejection({
          source: "inspiration",
          userId: owner.userId,
          taskId: task.id,
          expectedProjectId: owner.projectId ?? "",
          error,
        })
        await failInspirationPipelineForStaleContext(task.aggregateId)
        await failBackgroundTask(prisma, {
          taskId: task.id,
          leaseToken: task.leaseToken!,
          attempt: task.attempt,
          maxAttempts: task.maxAttempts,
          retryable: false,
          error: accountProjectContextStaleErrorString(),
        })
        return true
      }
      throw error
    }
  }

  try {
    // 注：UserQuestionCard 建卡已在 inspiration-events.ts 的 afterInspirationCreatedProcessQuestion
    // 中 fire-and-forget 触发（仅新建时），此处不再重复调用以避免 occurrenceCount 翻倍。

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

/**
 * Mark the inspiration failed and enqueue a NON-LEAKING generic error reply when
 * the account-project binding went stale. Mirrors the existing failure branch,
 * but the reply text is always the safe generic message (never a project name).
 */
async function failInspirationPipelineForStaleContext(inspirationId: string): Promise<void> {
  const inspiration = await prisma.inspiration.findUnique({
    where: { id: inspirationId },
    select: { source: true, externalChatId: true, externalMessageId: true, externalAccountId: true },
  })
  await prisma.$transaction(async (tx) => {
    await tx.inspiration.updateMany({
      where: { id: inspirationId, aiStatus: { not: "completed" } },
      data: { aiStatus: "failed", processingStage: "failed", errorMessage: ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE },
    })
    if (inspiration?.source) {
      await enqueueReply({
        inspirationId,
        replyType: "error",
        platform: inspiration.source,
        externalAccountId: inspiration.externalAccountId || undefined,
        externalChatId: inspiration.externalChatId || "",
        externalMessageId: inspiration.externalMessageId ?? undefined,
        replyText: ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE,
        skipBackgroundTask: false,
      }, tx as never)
    }
  })
  if (inspiration?.source) {
    recordChannelMetric({
      metric: "pipeline_failed",
      platform: inspiration.source,
      externalChatId: inspiration.externalChatId ?? undefined,
      externalAccountId: undefined,
    }).catch(() => {})
  }
}
