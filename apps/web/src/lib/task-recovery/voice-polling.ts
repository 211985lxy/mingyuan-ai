import { triggerAvatarDemoVideo } from "@/lib/avatar-demo";
import { prisma } from "@/lib/prisma";
import { getTaskInfo } from "@/lib/shanjian";
import { acquireTaskRecoveryLock } from "./lock";
import type { TaskRecoveryCandidates } from "./queries";

type VoiceAsset = TaskRecoveryCandidates[3][number];

export async function pollStaleVoiceAssets(assets: VoiceAsset[], logPrefix: string): Promise<number> {
  let polled = 0;
  for (const asset of assets) {
    if (asset.externalTaskId && await pollVoiceAsset(asset, logPrefix)) polled++;
  }
  return polled;
}

async function pollVoiceAsset(asset: VoiceAsset, logPrefix: string): Promise<boolean> {
  const externalTaskId = asset.externalTaskId;
  if (!externalTaskId || !await acquireTaskRecoveryLock(`poll:${externalTaskId}`)) return false;
  try {
    const result = await getTaskInfo(externalTaskId);
    if (result.status === "succeed") await settleVoiceAssetSuccess(asset, result, logPrefix);
    if (result.status === "failed") await settleVoiceAssetFailure(asset.id, result);
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to poll voice asset ${asset.id}:`, error);
    return false;
  }
}

async function settleVoiceAssetSuccess(
  asset: VoiceAsset,
  result: Awaited<ReturnType<typeof getTaskInfo>>,
  logPrefix: string,
): Promise<void> {
  const speakerId = result.result?.speakerId;
  const updated = await prisma.asset.updateMany({
    where: { id: asset.id, status: "processing" },
    data: {
      status: "ready",
      externalSpeakerId: speakerId ?? null,
      demoAudioUrl: result.result?.demoAudioUrl ?? null,
      errorCode: null,
      errorMessage: null,
    },
  });
  if (updated.count > 0 && speakerId && asset.sourceAvatarId) {
    await connectVoiceAssetToAvatar(asset.sourceAvatarId, asset.name, speakerId, logPrefix);
  }
}

async function settleVoiceAssetFailure(
  assetId: string,
  result: Awaited<ReturnType<typeof getTaskInfo>>,
): Promise<void> {
  await prisma.asset.updateMany({
    where: { id: assetId, status: "processing" },
    data: {
      status: "failed",
      externalTaskId: null,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
    },
  });
}

async function connectVoiceAssetToAvatar(
  avatarId: string,
  fallbackSpeakerName: string,
  speakerId: string,
  logPrefix: string,
): Promise<void> {
  const avatar = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { externalSpeakerId: true, externalVirtualmanId: true, demoTaskId: true, speakerName: true },
  });
  if (!avatar) return;

  if (!avatar.externalSpeakerId) {
    await prisma.avatar.update({
      where: { id: avatarId },
      data: { externalSpeakerId: speakerId, speakerName: avatar.speakerName || fallbackSpeakerName },
    });
  }
  if (avatar.externalVirtualmanId && !avatar.demoTaskId) {
    await triggerAvatarDemoVideo({
      avatarId,
      virtualmanId: avatar.externalVirtualmanId,
      speakerId: avatar.externalSpeakerId || speakerId,
      logPrefix,
    });
  }
}
