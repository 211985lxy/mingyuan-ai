import { claimBackgroundTask, completeBackgroundTask, failBackgroundTask } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import {
  accountProjectContextStaleErrorString,
  assertAccountProjectExecutionContext,
  isAccountProjectContextError,
  logAccountProjectContextRejection,
  logLegacyNullProjectTaskRejection,
} from "@/lib/account-project-context"
import { processInspiration } from "./process-inspiration"

export const INSPIRATION_PROCESS_TASK_KIND = "inspiration_process"

/**
 * @description 执行inspirationbackgroundtask
 * @param taskId - 任务 ID
 * @returns 无返回值
 */
export async function executeInspirationBackgroundTask(taskId: string) {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false
  let contextUserId = ""
  let contextProjectId = ""
  try {
    const inspiration = await prisma.inspiration.findUniqueOrThrow({ where: { id: task.aggregateId }, select: { userId: true, projectId: true } })
    contextUserId = inspiration.userId
    // 历史空项目记录（改绑前遗留，projectId = null）没有可验证的项目边界 →
    // 隔离（ACCOUNT_PROJECT_CONTEXT_STALE、不重试），绝不回退到账号级上下文继续处理。
    if (!inspiration.projectId) {
      await logLegacyNullProjectTaskRejection({
        source: "inspiration",
        taskId: task.id,
        userId: inspiration.userId,
      })
      await failBackgroundTask(prisma, { taskId: task.id, leaseToken: task.leaseToken!, attempt: task.attempt, maxAttempts: task.maxAttempts, retryable: false, error: accountProjectContextStaleErrorString() })
      return true
    }
    contextProjectId = inspiration.projectId
    // ── Re-validate account-project binding before any model call / write ──
    await assertAccountProjectExecutionContext({
      userId: inspiration.userId,
      projectId: inspiration.projectId,
      source: "inspiration",
    })
    await processInspiration(task.aggregateId, inspiration.userId, inspiration.projectId)
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
  } catch (error) {
    if (isAccountProjectContextError(error)) {
      await logAccountProjectContextRejection({
        source: "inspiration",
        userId: contextUserId,
        taskId: task.id,
        expectedProjectId: contextProjectId,
        error,
      })
      await failBackgroundTask(prisma, { taskId: task.id, leaseToken: task.leaseToken!, attempt: task.attempt, maxAttempts: task.maxAttempts, retryable: false, error: accountProjectContextStaleErrorString() })
      return true
    }
    await failBackgroundTask(prisma, { taskId: task.id, leaseToken: task.leaseToken!, attempt: task.attempt, maxAttempts: task.maxAttempts, retryable: true, error: error instanceof Error ? error.message : String(error) })
  }
  return true
}
