import { prisma } from "@/lib/prisma";
import {
  acquireSlot,
  calibrateSemaphore,
  getSlotUsage,
  releaseSlot,
} from "@/lib/shanjian-semaphore";
import { submitToShanjian } from "@/lib/shanjian-submit";
import {
  compensateVideoTaskSubmissionFailure,
  finalizeAcceptedVideoTaskSubmission,
} from "@/lib/video-task-settlement";

export async function consumeQueuedTasks(logPrefix: string): Promise<number> {
  await calibrateSemaphore();
  const available = getAvailableSlots(await getSlotUsage());
  if (available <= 0) return 0;

  const tasks = await prisma.videoTask.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: available,
  });
  let submitted = 0;

  for (const task of tasks) {
    if (await submitQueuedTask(task, logPrefix)) submitted++;
  }

  return submitted;
}

function getAvailableSlots(usage: number): number {
  const max = Number.parseInt(process.env.SHANJIAN_MAX_CONCURRENT ?? "8", 10);
  return max - usage;
}

async function submitQueuedTask(
  task: Awaited<ReturnType<typeof prisma.videoTask.findMany>>[number],
  logPrefix: string,
): Promise<boolean> {
  const slot = await acquireSlot();
  if (!slot) return false;

  try {
    const promoted = await prisma.videoTask.updateMany({
      where: { id: task.id, status: "queued" },
      data: { status: "pending" },
    });
    if (promoted.count === 0) {
      await releaseSlot();
      return false;
    }

    const payload = task.shanjianPayload as Record<string, unknown>;
    if (!payload?.videoType) throw new Error("Missing shanjianPayload.videoType for queued task");

    const result = await submitToShanjian(payload.videoType as string, payload);
    await finalizeAcceptedVideoTaskSubmission({
      taskId: task.id,
      externalTaskId: result.taskId,
      productionPlanId: task.productionPlanId,
      shanjianPayload: result.payload,
    });
    console.log(`${logPrefix} Submitted queued task ${task.id}, externalTaskId=${result.taskId}`);
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to submit queued task ${task.id}:`, error);
    await compensateVideoTaskSubmissionFailure({
      taskId: task.id,
      errorMessage: error instanceof Error ? error.message : "队列提交失败，请重试",
    });
    return false;
  }
}
