import { failBackgroundTask, claimBackgroundTask, completeBackgroundTask, planBackgroundTaskFailure } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { runCompetitorAnalysisPipeline } from "./pipeline"

export const COMPETITOR_ANALYSIS_TASK_KIND = "competitor_analysis"

function isRetryable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return !/未配置|UNSUPPORTED|INVALID|AccessDenied|Unauthorized|Forbidden/i.test(message)
}

export async function executeCompetitorAnalysisBackgroundTask(taskId: string) {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false
  try {
    await runCompetitorAnalysisPipeline(task.aggregateId)
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
  } catch (error) {
    const retryable = isRetryable(error)
    const plan = planBackgroundTaskFailure({ attempt: task.attempt, maxAttempts: task.maxAttempts, retryable, now: new Date() })
    await failBackgroundTask(prisma, { taskId: task.id, leaseToken: task.leaseToken!, attempt: task.attempt, maxAttempts: task.maxAttempts, retryable, error: error instanceof Error ? error.message : String(error) })
    if (plan.status === "retry_wait") {
      await prisma.competitorAnalysis.update({ where: { id: task.aggregateId }, data: { status: "pending", currentStep: "pending" } })
    }
  }
  return true
}
