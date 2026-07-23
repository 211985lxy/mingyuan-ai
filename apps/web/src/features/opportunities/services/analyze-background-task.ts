// @ts-nocheck — WIP
import { claimBackgroundTask, completeBackgroundTask, failBackgroundTask } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { analyzeCollection } from "./collection-analyzer"

export const OPPORTUNITY_ANALYZE_TASK_KIND = "opportunity_analyze"

/**
 * 后台任务执行器：批量分析研究篮
 */
export async function executeOpportunityAnalyzeBackgroundTask(taskId: string): Promise<boolean> {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  const collectionId = task.aggregateId

  try {
    await analyzeCollection(collectionId)
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
  } catch (err) {
    const message = err instanceof Error ? err.message : "分析失败"
    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable: false,
      error: message,
    })
  }
  return true
}
import { claimBackgroundTask, completeBackgroundTask, failBackgroundTask } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { analyzeCollection } from "./collection-analyzer"

export const OPPORTUNITY_ANALYZE_TASK_KIND = "opportunity_analyze"

/**
 * 后台任务执行器：批量分析研究篮
 */
export async function executeOpportunityAnalyzeBackgroundTask(taskId: string): Promise<boolean> {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  const collectionId = task.aggregateId

  try {
    await analyzeCollection(collectionId)
    await completeBackgroundTask(prisma, taskId)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : "分析失败"
    await failBackgroundTask(prisma, taskId, message)
    return false
  }
}
