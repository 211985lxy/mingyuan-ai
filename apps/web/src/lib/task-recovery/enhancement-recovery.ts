import { getEnhancementJobResult } from "@/lib/aliyun-enhancement";
import { isManagedOssUrl } from "@/lib/oss";
import { prisma } from "@/lib/prisma";
import { settleEnhancementFailure, settleEnhancementSuccess, triggerVideoEnhancement } from "@/lib/video-task-enhancement";
import { ENHANCEMENT_POLL_DELAY_MS, ENHANCEMENT_ZOMBIE_TIMEOUT_MS, type EnhancementRecoverySummary, type TaskRecoveryInput } from "./contracts";
import { acquireTaskRecoveryLock } from "./lock";

export async function runEnhancementRecoveryPass(input: TaskRecoveryInput): Promise<EnhancementRecoverySummary> {
  const now = input.now ?? new Date();
  const logPrefix = `[enhancement-recovery:${input.trigger}]`;
  const poll = await pollStaleEnhancements(now, logPrefix);
  const zombies = await expireZombieEnhancements(now, logPrefix);
  const retry = await retryTransferFailures(logPrefix);
  const backfill = await backfillEnhancements(logPrefix);
  return {
    enhancementsPolled: poll.polled,
    enhancementsSettled: poll.settled + retry,
    zombiesExpired: zombies,
    backfillTriggered: backfill,
  };
}

async function pollStaleEnhancements(now: Date, logPrefix: string): Promise<{ polled: number; settled: number }> {
  const tasks = await prisma.videoTask.findMany({
    where: { enhancementStatus: "processing", enhancementJobId: { not: null }, updatedAt: { lt: before(now, ENHANCEMENT_POLL_DELAY_MS) } },
    take: 50,
  });
  let polled = 0;
  let settled = 0;
  for (const task of tasks) {
    const result = await pollEnhancementTask(task.id, task.enhancementJobId!, logPrefix);
    polled += Number(result.polled);
    settled += Number(result.settled);
  }
  return { polled, settled };
}

async function pollEnhancementTask(taskId: string, jobId: string, logPrefix: string): Promise<{ polled: boolean; settled: boolean }> {
  if (!await acquireTaskRecoveryLock(`poll:enhancement:${jobId}`)) return { polled: false, settled: false };
  try {
    const result = await getEnhancementJobResult(jobId);
    if (result.status === "PROCESS_SUCCESS" && result.videoUrl) {
      await settleEnhancementSuccess({ taskId, temporaryVideoUrl: result.videoUrl });
      console.log(`${logPrefix} Settled enhancement success for task ${taskId}`);
      return { polled: true, settled: true };
    }
    if (result.status === "PROCESS_SUCCESS") {
      await settleEnhancementFailure({ taskId, errorCode: "MISSING_VIDEO_URL", errorMessage: "Enhancement completed but no video URL returned from API" });
      return { polled: true, settled: true };
    }
    if (result.status === "PROCESS_FAIL") {
      await settleEnhancementFailure({ taskId, errorCode: result.errorCode ?? "ENHANCEMENT_FAILED", errorMessage: result.errorMessage ?? "Enhancement processing failed" });
      console.log(`${logPrefix} Settled enhancement failure for task ${taskId}`);
      return { polled: true, settled: true };
    }
    return { polled: true, settled: false };
  } catch (error) {
    console.error(`${logPrefix} Failed to poll enhancement for task ${taskId}:`, error);
    return { polled: false, settled: false };
  }
}

async function expireZombieEnhancements(now: Date, logPrefix: string): Promise<number> {
  const tasks = await prisma.videoTask.findMany({
    where: { enhancementStatus: "processing", enhancementStartedAt: { lt: before(now, ENHANCEMENT_ZOMBIE_TIMEOUT_MS) } },
    take: 20,
  });
  let expired = 0;
  for (const task of tasks) {
    if (await expireZombieEnhancement(task.id, logPrefix)) expired++;
  }
  return expired;
}

async function expireZombieEnhancement(taskId: string, logPrefix: string): Promise<boolean> {
  try {
    await settleEnhancementFailure({ taskId, errorCode: "ENHANCEMENT_TIMEOUT", errorMessage: "4K enhancement processing timeout (>2 hours)" });
    console.warn(`${logPrefix} Expired zombie enhancement for task ${taskId}`);
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to expire zombie enhancement for task ${taskId}:`, error);
    return false;
  }
}

async function retryTransferFailures(logPrefix: string): Promise<number> {
  const tasks = await prisma.videoTask.findMany({
    where: { enhancementStatus: "failed", enhancementErrorCode: "TRANSFER_FAILED", enhancementJobId: { not: null } },
    take: 5,
  });
  let retried = 0;
  for (const task of tasks) {
    if (await retryTransferFailure(task.id, task.enhancementJobId!, logPrefix)) retried++;
  }
  return retried;
}

async function retryTransferFailure(taskId: string, jobId: string, logPrefix: string): Promise<boolean> {
  if (!await acquireTaskRecoveryLock(`retry:enhancement:${jobId}`)) return false;
  try {
    const result = await getEnhancementJobResult(jobId);
    if (result.status !== "PROCESS_SUCCESS" || !result.videoUrl) return false;
    await prisma.videoTask.update({ where: { id: taskId }, data: { enhancementStatus: "processing", enhancementErrorCode: null, enhancementErrorMessage: null, enhancementCompletedAt: null } });
    await settleEnhancementSuccess({ taskId, temporaryVideoUrl: result.videoUrl });
    console.log(`${logPrefix} Retried TRANSFER_FAILED enhancement for task ${taskId} - success`);
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to retry TRANSFER_FAILED enhancement for task ${taskId}:`, error);
    return false;
  }
}

async function backfillEnhancements(logPrefix: string): Promise<number> {
  const tasks = await prisma.videoTask.findMany({
    where: { status: "completed", deliveryStatus: "durable", enhancementStatus: null, videoUrl: { not: null } },
    select: { id: true, videoUrl: true },
    take: 5,
  });
  let triggered = 0;
  for (const task of tasks) {
    if (task.videoUrl && isManagedOssUrl(task.videoUrl) && await triggerEnhancementBackfill(task.id, task.videoUrl, logPrefix)) {
      triggered++;
    }
  }
  return triggered;
}

async function triggerEnhancementBackfill(taskId: string, sourceVideoUrl: string, logPrefix: string): Promise<boolean> {
  if (!await acquireTaskRecoveryLock(`backfill:enhancement:${taskId}`)) return false;
  try {
    await triggerVideoEnhancement({ taskId, sourceVideoUrl });
    console.log(`${logPrefix} Backfill triggered enhancement for task ${taskId}`);
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to backfill enhancement for task ${taskId}:`, error);
    return false;
  }
}

function before(now: Date, durationMs: number): Date {
  return new Date(now.getTime() - durationMs);
}
