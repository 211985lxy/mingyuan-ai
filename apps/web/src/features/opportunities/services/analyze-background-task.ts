import { claimBackgroundTask, completeBackgroundTask, failBackgroundTask } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { analyzeCollection } from "./collection-analyzer"

export const OPPORTUNITY_ANALYZE_TASK_KIND = "opportunity_analyze"

/** 后台任务执行器：批量分析研究篮 */
export async function executeOpportunityAnalyzeBackgroundTask(taskId: string): Promise<boolean> {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  try {
    await analyzeCollection(task.aggregateId)
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
  } catch (error) {
    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return true
}
