import { claimBackgroundTask, completeBackgroundTask, failBackgroundTask } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
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
  try {
    const inspiration = await prisma.inspiration.findUniqueOrThrow({ where: { id: task.aggregateId }, select: { userId: true } })
    await processInspiration(task.aggregateId, inspiration.userId)
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
  } catch (error) {
    await failBackgroundTask(prisma, { taskId: task.id, leaseToken: task.leaseToken!, attempt: task.attempt, maxAttempts: task.maxAttempts, retryable: true, error: error instanceof Error ? error.message : String(error) })
  }
  return true
}
