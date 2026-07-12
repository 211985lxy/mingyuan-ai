import { createAvatarVoiceCloneAsset, createAvatarVoiceCloneAssetFromVideo, ensureAvatarVoiceAsset } from "@/lib/avatar-voice-assets";
import { triggerAvatarDemoVideo } from "@/lib/avatar-demo";
import { transferFromUrl } from "@/lib/oss";
import { prisma } from "@/lib/prisma";
import { getTaskInfo } from "@/lib/shanjian";
import { acquireTaskRecoveryLock } from "./lock";
import type { TaskRecoveryCandidates } from "./queries";

type StaleAvatar = TaskRecoveryCandidates[0][number];
type ReadyAvatar = TaskRecoveryCandidates[4][number];
type MissingDemoAvatar = TaskRecoveryCandidates[5][number];

export async function pollStaleAvatars(avatars: StaleAvatar[], logPrefix: string): Promise<number> {
  let polled = 0;
  for (const avatar of avatars) {
    if (avatar.externalTaskId && await pollStaleAvatar(avatar, logPrefix)) polled++;
  }
  return polled;
}

async function pollStaleAvatar(avatar: StaleAvatar, logPrefix: string): Promise<boolean> {
  const externalTaskId = avatar.externalTaskId;
  if (!externalTaskId || !await acquireTaskRecoveryLock(`poll:${externalTaskId}`)) return false;

  try {
    const taskResult = await getTaskInfo(externalTaskId);
    if (taskResult.status === "succeed") {
      await settleAvatarCloneSuccess(avatar, taskResult, logPrefix);
    } else if (taskResult.status === "failed") {
      await prisma.avatar.updateMany({
        where: { id: avatar.id, status: "cloning" },
        data: { status: "failed", errorCode: taskResult.errorCode ?? null, errorMessage: taskResult.errorMessage ?? null },
      });
    }
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to poll avatar ${avatar.id}:`, error);
    return false;
  }
}

async function settleAvatarCloneSuccess(
  avatar: StaleAvatar,
  taskResult: Awaited<ReturnType<typeof getTaskInfo>>,
  logPrefix: string,
): Promise<void> {
  const virtualmanId = taskResult.result?.virtualmanId;
  if (!virtualmanId) {
    await markAvatarMissingVirtualmanId(avatar.id);
    return;
  }

  const speakerName = `${avatar.name}的声音`;
  const updated = await prisma.avatar.updateMany({
    where: { id: avatar.id, status: "cloning" },
    data: {
      status: "ready",
      externalVirtualmanId: virtualmanId,
      externalSpeakerId: taskResult.result?.speakerId ?? null,
      coverUrl: await transferAvatarCover(taskResult.result?.coverUrl, avatar.id),
      speakerName,
    },
  });
  if (updated.count === 0) return;

  await createAvatarVoiceAsset(avatar, taskResult, speakerName);
  triggerAvatarDemoIfReady(avatar.id, virtualmanId, taskResult.result?.speakerId, logPrefix);
}

async function markAvatarMissingVirtualmanId(avatarId: string): Promise<void> {
  await prisma.avatar.updateMany({
    where: { id: avatarId, status: "cloning" },
    data: {
      status: "failed",
      errorCode: "MISSING_VIRTUALMAN_ID",
      errorMessage: "克隆完成但未返回数字人 ID，请重新克隆",
    },
  });
}

async function transferAvatarCover(coverUrl: string | undefined, avatarId: string): Promise<string | null> {
  return coverUrl ? transferFromUrl(coverUrl, `avatars/${avatarId}/cover.jpg`) : null;
}

async function createAvatarVoiceAsset(
  avatar: StaleAvatar,
  taskResult: Awaited<ReturnType<typeof getTaskInfo>>,
  speakerName: string,
): Promise<void> {
  const result = taskResult.result;
  if (result?.speakerId) {
    await ensureAvatarVoiceAsset({ userId: avatar.userId, avatarName: avatar.name, speakerId: result.speakerId, speakerName, sourceAvatarId: avatar.id, sourceVideoUrl: avatar.sourceVideoUrl, demoAudioUrl: result.demoAudioUrl });
  } else if (result?.audioUrl) {
    await createAvatarVoiceCloneAsset({ userId: avatar.userId, avatarName: avatar.name, speakerName, sourceAvatarId: avatar.id, audioUrl: result.audioUrl, sourceVideoUrl: avatar.sourceVideoUrl });
  } else if (avatar.sourceVideoUrl) {
    await createAvatarVoiceCloneAssetFromVideo({ userId: avatar.userId, avatarId: avatar.id, avatarName: avatar.name, speakerName, sourceVideoUrl: avatar.sourceVideoUrl });
  }
}

function triggerAvatarDemoIfReady(
  avatarId: string,
  virtualmanId: string,
  speakerId: string | undefined,
  logPrefix: string,
): void {
  if (!speakerId) return;
  triggerAvatarDemoVideo({ avatarId, virtualmanId, speakerId, logPrefix }).catch((error) => {
    console.error(`${logPrefix} Demo video trigger failed for avatar ${avatarId}:`, error);
  });
}

export async function repairAvatarVoices(avatars: ReadyAvatar[], logPrefix: string): Promise<number> {
  let repaired = 0;
  for (const avatar of avatars) {
    if (await repairAvatarVoice(avatar, logPrefix)) repaired++;
  }
  return repaired;
}

async function repairAvatarVoice(avatar: ReadyAvatar, logPrefix: string): Promise<boolean> {
  try {
    if (!await acquireTaskRecoveryLock(`repair:voice:${avatar.id}`)) return false;
    return Boolean(await createAvatarVoiceCloneAssetFromVideo({
      userId: avatar.userId,
      avatarId: avatar.id,
      avatarName: avatar.name,
      speakerName: avatar.speakerName || `${avatar.name}的声音`,
      sourceVideoUrl: avatar.sourceVideoUrl!,
    }));
  } catch (error) {
    console.error(`${logPrefix} Failed to repair voice for avatar ${avatar.id}:`, error);
    return false;
  }
}

export async function repairAvatarDemos(avatars: MissingDemoAvatar[], logPrefix: string): Promise<number> {
  let repaired = 0;
  for (const avatar of avatars) {
    if (await repairAvatarDemo(avatar, logPrefix)) repaired++;
  }
  return repaired;
}

async function repairAvatarDemo(avatar: MissingDemoAvatar, logPrefix: string): Promise<boolean> {
  try {
    if (!await acquireTaskRecoveryLock(`repair:demo:${avatar.id}`)) return false;
    return Boolean(await triggerAvatarDemoVideo({
      avatarId: avatar.id,
      virtualmanId: avatar.externalVirtualmanId!,
      speakerId: avatar.externalSpeakerId!,
      logPrefix,
    }));
  } catch (error) {
    console.error(`${logPrefix} Failed to repair demo video for avatar ${avatar.id}:`, error);
    return false;
  }
}
