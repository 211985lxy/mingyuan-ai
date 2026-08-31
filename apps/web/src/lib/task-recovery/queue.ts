import { prisma } from "@/lib/prisma"
import { submitVideoToProvider } from "@/lib/digital-human-provider"
import {
  acquireProviderSlot,
  calibrateProviderSemaphore,
  getProviderSlotUsage,
  providerMaxConcurrent,
  type DigitalHumanProvider,
  releaseProviderSlot,
} from "@/lib/digital-human-semaphore"
import {
  compensateVideoTaskSubmissionFailure,
  finalizeAcceptedVideoTaskSubmission,
} from "@/lib/video-task-settlement"

const PROVIDERS: DigitalHumanProvider[] = ["chanjing", "shanjian"]

export async function consumeQueuedTasks(logPrefix: string): Promise<number> {
  let submitted = 0
  for (const provider of PROVIDERS) {
    submitted += await consumeProviderQueue(provider, logPrefix)
  }
  return submitted
}

async function consumeProviderQueue(
  provider: DigitalHumanProvider,
  logPrefix: string,
): Promise<number> {
  await calibrateProviderSemaphore(provider)
  const available = providerMaxConcurrent(provider) - await getProviderSlotUsage(provider)
  if (available <= 0) return 0

  const tasks = await prisma.videoTask.findMany({
    where: { status: "queued", provider, externalTaskId: null },
    orderBy: { createdAt: "asc" },
    take: available,
  })
  let submitted = 0

  for (const task of tasks) {
    if (await submitQueuedTask(task, provider, logPrefix)) submitted++
  }
  return submitted
}

async function submitQueuedTask(
  task: Awaited<ReturnType<typeof prisma.videoTask.findMany>>[number],
  provider: DigitalHumanProvider,
  logPrefix: string,
): Promise<boolean> {
  const slot = await acquireProviderSlot(provider)
  if (!slot) return false

  try {
    const promoted = await prisma.videoTask.updateMany({
      where: { id: task.id, status: "queued", externalTaskId: null },
      data: { status: "pending" },
    })
    if (promoted.count === 0) {
      await releaseProviderSlot(provider)
      return false
    }

    const payload = task.shanjianPayload as Record<string, unknown> | null
    const result = await submitVideoToProvider(provider, task.videoType, payload ?? {})
    await finalizeAcceptedVideoTaskSubmission({
      taskId: task.id,
      externalTaskId: result.taskId,
      productionPlanId: task.productionPlanId,
      shanjianPayload: result.payload,
    })
    console.log(`${logPrefix} Submitted queued ${provider} task ${task.id}, externalTaskId=${result.taskId}`)
    return true
  } catch (error) {
    console.error(`${logPrefix} Failed to submit queued ${provider} task ${task.id}:`, error)
    await compensateVideoTaskSubmissionFailure({
      taskId: task.id,
      errorMessage: error instanceof Error ? error.message : "队列提交失败，请重试",
    })
    return false
  }
}
