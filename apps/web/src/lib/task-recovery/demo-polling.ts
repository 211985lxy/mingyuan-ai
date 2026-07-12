import { transferFromUrl } from "@/lib/oss";
import { prisma } from "@/lib/prisma";
import { getTaskInfo } from "@/lib/shanjian";
import { acquireTaskRecoveryLock } from "./lock";
import type { TaskRecoveryCandidates } from "./queries";

type DemoAvatar = TaskRecoveryCandidates[6][number];

export async function pollPendingDemos(avatars: DemoAvatar[], logPrefix: string): Promise<number> {
  let polled = 0;
  for (const avatar of avatars) {
    if (avatar.demoTaskId && await pollPendingDemo(avatar, logPrefix)) polled++;
  }
  return polled;
}

async function pollPendingDemo(avatar: DemoAvatar, logPrefix: string): Promise<boolean> {
  const demoTaskId = avatar.demoTaskId;
  if (!demoTaskId || !await acquireTaskRecoveryLock(`poll:${demoTaskId}`)) return false;
  try {
    const result = await getTaskInfo(demoTaskId);
    if (result.status === "succeed") await settleDemoSuccess(avatar.id, result);
    if (result.status === "failed") await settleDemoFailure(avatar.id, result, logPrefix);
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to poll demo video for avatar ${avatar.id}:`, error);
    return false;
  }
}

async function settleDemoSuccess(
  avatarId: string,
  result: Awaited<ReturnType<typeof getTaskInfo>>,
): Promise<void> {
  const videoUrl = result.result?.videoUrl
    ? await transferFromUrl(result.result.videoUrl, `avatars/${avatarId}/demo.mp4`)
    : null;
  const coverUrl = result.result?.coverUrl
    ? await transferFromUrl(result.result.coverUrl, `avatars/${avatarId}/demo-cover.jpg`)
    : null;
  await prisma.avatar.update({
    where: { id: avatarId },
    data: { demoVideoUrl: videoUrl, ...(coverUrl ? { coverUrl } : {}) },
  });
}

async function settleDemoFailure(
  avatarId: string,
  result: Awaited<ReturnType<typeof getTaskInfo>>,
  logPrefix: string,
): Promise<void> {
  await prisma.avatar.update({ where: { id: avatarId }, data: { demoTaskId: null } });
  console.warn(`${logPrefix} Demo video failed for avatar ${avatarId}: ${result.errorCode} ${result.errorMessage}`);
}
