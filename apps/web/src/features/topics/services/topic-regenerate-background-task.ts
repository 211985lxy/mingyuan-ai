import {
  claimBackgroundTask,
  completeBackgroundTask,
  failBackgroundTask,
} from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { generateAndPushDailyTopics } from "./daily-topic-push"

/** 「换一批」：重新生成一批选题并推送新的裁决卡。 */
export const TOPIC_REGENERATE_TASK_KIND = "topic_regenerate"

/**
 * @description 执行「换一批」后台任务
 *  - 卡片回调必须秒回，生成要走 LLM，因此换一批在后台任务里跑
 *  - 记录缺失或已无项目归属时直接释放任务，不做无依据的生成
 * @param taskId - 后台任务 ID
 * @returns 是否已处理
 */
export async function executeTopicRegenerateBackgroundTask(taskId: string) {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  try {
    const selection = await prisma.topicSelection.findUnique({
      where: { id: task.aggregateId },
      select: { userId: true, projectId: true },
    })
    if (!selection?.projectId) {
      await completeBackgroundTask(prisma, task.id, task.leaseToken!)
      return true
    }

    const result = await generateAndPushDailyTopics({
      userId: selection.userId,
      projectId: selection.projectId,
      requestId: `topic-regen-${task.id}`,
      refreshCount: 1,
    })
    if (!result.ok) throw new Error(result.error)

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
