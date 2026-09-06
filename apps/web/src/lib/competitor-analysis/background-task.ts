import { failBackgroundTask, claimBackgroundTask, completeBackgroundTask, planBackgroundTaskFailure } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { runCompetitorAnalysisPipeline } from "./pipeline"
import {
  ACCOUNT_PROJECT_CONTEXT_STALE,
  ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE,
  accountProjectContextStaleErrorString,
  assertAccountProjectExecutionContext,
  isAccountProjectContextError,
  logAccountProjectContextRejection,
} from "@/lib/account-project-context"

export const COMPETITOR_ANALYSIS_TASK_KIND = "competitor_analysis"

function isRetryable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return !/未配置|UNSUPPORTED|INVALID|AccessDenied|Unauthorized|Forbidden/i.test(message)
}

/**
 * 竞品分析任务在真正运行流水线前，用 Task-1 总闸门重新校验“账号绑定项目 ==
 * 记录归属项目”。记录缺失直接释放任务；历史空项目记录与绑定不一致都按
 * 不可恢复隔离处理（ACCOUNT_PROJECT_CONTEXT_STALE：不重试、不调用流水线、
 * 不记录客户正文，对外只给通用提示）。
 */
export async function executeCompetitorAnalysisBackgroundTask(taskId: string) {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  const analysisId = task.aggregateId

  try {
    // ── Read the owning analysis row (project ownership lives on the record) ──
    const analysis = await prisma.competitorAnalysis.findUnique({
      where: { id: analysisId },
      select: { userId: true, projectId: true },
    })
    if (!analysis) {
      // 记录已不存在：没有可处理内容，释放任务即可。
      await completeBackgroundTask(prisma, task.id, task.leaseToken!)
      return true
    }

    // 历史空项目记录没有可验证的项目边界 → 隔离，绝不回退到用户级数据继续跑流水线。
    if (!analysis.projectId) {
      await logStaleContextRejection({
        source: "background",
        taskId: task.id,
        userId: analysis.userId,
        expectedProjectId: null,
      })
      await failAnalysisForStaleContext(analysisId)
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

    // ── Re-validate the account-project binding before spending any pipeline ──
    try {
      await assertAccountProjectExecutionContext({
        userId: analysis.userId,
        projectId: analysis.projectId,
        source: "background",
      })
    } catch (error) {
      if (isAccountProjectContextError(error)) {
        await logAccountProjectContextRejection({
          source: "background",
          userId: analysis.userId,
          taskId: task.id,
          expectedProjectId: analysis.projectId,
          error,
        })
        await failAnalysisForStaleContext(analysisId)
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

    await runCompetitorAnalysisPipeline(analysisId)
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

/**
 * Best-effort: mark the analysis failed with the generic, non-leaking message.
 * Never throws — a failed status write must not prevent failBackgroundTask.
 */
async function failAnalysisForStaleContext(analysisId: string): Promise<void> {
  try {
    await prisma.competitorAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "failed",
        currentStep: "failed",
        errorMessage: ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE,
      },
    })
  } catch {
    // best-effort — background task failure is the source of truth
  }
}

/**
 * Minimal, safe audit line for a legacy null-project task (no typed guard error
 * exists to feed logAccountProjectContextRejection). Never logs customer content.
 */
async function logStaleContextRejection(input: {
  source: "background"
  taskId: string
  userId: string
  expectedProjectId: string | null
}): Promise<void> {
  // eslint-disable-next-line no-console
  console.error(`[account-project-context-stale]`, {
    source: input.source,
    taskId: input.taskId,
    userId: input.userId,
    expectedProjectId: input.expectedProjectId,
    boundProjectId: null,
    code: ACCOUNT_PROJECT_CONTEXT_STALE,
  })
}
