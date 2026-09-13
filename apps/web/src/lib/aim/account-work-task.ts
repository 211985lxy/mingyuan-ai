import {
  claimBackgroundTask,
  completeBackgroundTask,
  failBackgroundTask,
} from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { refreshDouyinAccessToken, type DouyinToken } from "@/lib/douyin-openapi"
import { ACCOUNT_WORK_INIT_KIND, TRANSCRIPT_LAZY_KIND } from "@/lib/aim/account-work-asset"
import { syncAccountWorksFromDouyin } from "@/lib/aim/account-work-sync"
import { extractAccountWorkTranscript } from "@/lib/aim/account-work-transcript"
import { resolveBoundProject } from "@/lib/account-project-context"

async function tokenFromBinding(accountId: string): Promise<{
  userId: string
  token: DouyinToken
} | null> {
  const row = await prisma.douyinAccountBinding.findUnique({ where: { id: accountId } })
  if (!row) return null
  let token: DouyinToken = {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    openId: row.openId,
    unionId: row.unionId,
    expiresIn: Math.floor((row.accessExpiresAt.getTime() - Date.now()) / 1000),
    scope: row.scope,
  }
  if (token.expiresIn < 3600 && row.refreshToken) {
    const renewed = await refreshDouyinAccessToken(row.refreshToken)
    if (!renewed) return null
    token = renewed
    await prisma.douyinAccountBinding.update({
      where: { id: accountId },
      data: {
        accessToken: renewed.accessToken,
        refreshToken: renewed.refreshToken,
        accessExpiresAt: new Date(Date.now() + renewed.expiresIn * 1000),
      },
    })
  }
  return { userId: row.userId, token }
}

export async function executeAccountWorkInitTask(taskId: string): Promise<boolean> {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false
  try {
    const binding = await tokenFromBinding(task.aggregateId)
    if (!binding) throw new Error("抖音绑定不存在或令牌失效")
    const project = await resolveBoundProject({ userId: binding.userId })
    await syncAccountWorksFromDouyin({
      userId: binding.userId,
      projectId: project.id,
      accountId: task.aggregateId,
      token: binding.token,
    })
    await completeBackgroundTask(prisma, task.id, task.leaseToken!, new Date())
    return true
  } catch (error) {
    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable: true,
      error: error instanceof Error ? error.message : "账号历史回补失败",
    })
    return true
  }
}

export async function executeAccountWorkTranscriptTask(taskId: string): Promise<boolean> {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false
  try {
    await extractAccountWorkTranscript(task.aggregateId)
    await completeBackgroundTask(prisma, task.id, task.leaseToken!, new Date())
    return true
  } catch (error) {
    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable: true,
      error: error instanceof Error ? error.message : "逐字稿提取失败",
    })
    return true
  }
}

export const ACCOUNT_WORK_TASK_KINDS = [ACCOUNT_WORK_INIT_KIND, TRANSCRIPT_LAZY_KIND] as const
