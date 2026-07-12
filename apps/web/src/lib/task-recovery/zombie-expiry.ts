import { prisma } from "@/lib/prisma";
import { releaseSlot } from "@/lib/shanjian-semaphore";
import { settleVideoTaskFailure } from "@/lib/video-task-settlement";
import {
  AVATAR_CLONE_ZOMBIE_TIMEOUT_MS,
  PROCESSING_ZOMBIE_TIMEOUT_MS,
  QUEUED_ZOMBIE_TIMEOUT_MS,
} from "./contracts";

export async function expireZombieTasks(now: Date, logPrefix: string): Promise<void> {
  await expireProcessingVideos(now, logPrefix);
  await expireQueuedVideos(now, logPrefix);
  await expireCloningAvatars(now, logPrefix);
}

async function expireProcessingVideos(now: Date, logPrefix: string): Promise<void> {
  const tasks = await prisma.videoTask.findMany({
    where: { status: "processing", updatedAt: { lt: before(now, PROCESSING_ZOMBIE_TIMEOUT_MS) } },
    take: 20,
  });
  for (const task of tasks) {
    await expireVideoTask(task.id, "PROCESSING_TIMEOUT", "视频生成超时（超过 2 小时），请重试", false, logPrefix);
  }
}

async function expireQueuedVideos(now: Date, logPrefix: string): Promise<void> {
  const tasks = await prisma.videoTask.findMany({
    where: { status: "queued", createdAt: { lt: before(now, QUEUED_ZOMBIE_TIMEOUT_MS) } },
    take: 20,
  });
  for (const task of tasks) {
    await expireVideoTask(task.id, "QUEUED_TIMEOUT", "排队超时（超过 30 分钟），请重新提交", true, logPrefix);
  }
}

async function expireVideoTask(
  taskId: string,
  errorCode: string,
  errorMessage: string,
  releasePlanReservation: boolean,
  logPrefix: string,
): Promise<void> {
  try {
    await settleVideoTaskFailure({ taskId, errorCode, errorMessage, source: "recovery", releasePlanReservation });
    console.warn(`${logPrefix} Expired zombie video task ${taskId}`);
  } catch (error) {
    console.error(`${logPrefix} Failed to expire zombie video task ${taskId}:`, error);
  }
}

async function expireCloningAvatars(now: Date, logPrefix: string): Promise<void> {
  const avatars = await prisma.avatar.findMany({
    where: { status: "cloning", updatedAt: { lt: before(now, AVATAR_CLONE_ZOMBIE_TIMEOUT_MS) } },
    take: 20,
  });
  for (const avatar of avatars) {
    await expireCloningAvatar(avatar.id, logPrefix);
  }
}

async function expireCloningAvatar(avatarId: string, logPrefix: string): Promise<void> {
  try {
    const updated = await prisma.avatar.updateMany({
      where: { id: avatarId, status: "cloning" },
      data: { status: "failed", errorCode: "CLONING_TIMEOUT", errorMessage: "数字人克隆超时，请重试" },
    });
    if (updated.count > 0) await releaseSlot();
    console.warn(`${logPrefix} Expired zombie cloning avatar ${avatarId}`);
  } catch (error) {
    console.error(`${logPrefix} Failed to expire zombie cloning avatar ${avatarId}:`, error);
  }
}

function before(now: Date, durationMs: number): Date {
  return new Date(now.getTime() - durationMs);
}
