import { prisma } from "@/lib/prisma";
import { AVATAR_REQUIRING_TYPES, type CreateVideoTaskInput, type ResolvedAvatar, type VideoTaskType, VideoTaskRequestError } from "./contracts";

export async function resolveVideoTaskAvatar(input: {
  userId: string;
  videoType: VideoTaskType;
  body: CreateVideoTaskInput;
}): Promise<ResolvedAvatar | null> {
  if (!AVATAR_REQUIRING_TYPES.includes(input.videoType)) return null;
  if (input.body.virtualmanId && input.body.speakerId) return buildPublicAvatar(input.userId, input.body);
  if (!input.body.avatarId) {
    throw new VideoTaskRequestError("avatarId or (virtualmanId + speakerId) is required", 400);
  }

  const avatar = await loadAvatar(input.body.avatarId);
  validateOwnedAvatar(avatar, input.userId);
  const speakerId = await resolveAvatarSpeakerId({
    avatarId: avatar.id,
    userId: input.userId,
    speakerId: avatar.externalSpeakerId,
    speakerName: avatar.speakerName,
  });
  if (!speakerId) {
    throw new VideoTaskRequestError("该数字人的专属声音还在克隆中，请稍后再试或更换数字人", 422);
  }
  return { ...avatar, externalSpeakerId: speakerId };
}

function buildPublicAvatar(userId: string, body: CreateVideoTaskInput): ResolvedAvatar {
  const name = body.avatarName || "公共数字人";
  return {
    id: "public",
    name,
    userId,
    status: "ready",
    externalVirtualmanId: body.virtualmanId as string,
    externalSpeakerId: body.speakerId as string,
    speakerName: name,
  };
}

async function loadAvatar(avatarId: string) {
  return prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { id: true, name: true, userId: true, status: true, externalVirtualmanId: true, externalSpeakerId: true, speakerName: true },
  });
}

function validateOwnedAvatar(
  avatar: Awaited<ReturnType<typeof loadAvatar>>,
  userId: string,
): asserts avatar is NonNullable<typeof avatar> {
  if (!avatar || avatar.userId !== userId) throw new VideoTaskRequestError("Avatar not found", 404);
  if (avatar.status !== "ready") throw new VideoTaskRequestError("Avatar is not ready", 422);
  if (!avatar.externalVirtualmanId) throw new VideoTaskRequestError("Avatar clone did not produce required IDs", 422);
}

async function resolveAvatarSpeakerId(input: {
  avatarId: string;
  userId: string;
  speakerId: string | null;
  speakerName?: string | null;
}): Promise<string | null> {
  if (input.speakerId) return input.speakerId;
  const linkedVoice = await prisma.asset.findFirst({
    where: {
      userId: input.userId,
      assetType: "voice",
      status: "ready",
      externalSpeakerId: { not: null },
      OR: [{ sourceAvatarId: input.avatarId }, ...(input.speakerName ? [{ name: input.speakerName }] : [])],
    },
    orderBy: { createdAt: "desc" },
    select: { externalSpeakerId: true, name: true },
  });
  if (!linkedVoice?.externalSpeakerId) return null;
  await prisma.avatar.update({
    where: { id: input.avatarId },
    data: { externalSpeakerId: linkedVoice.externalSpeakerId, speakerName: input.speakerName || linkedVoice.name },
  });
  return linkedVoice.externalSpeakerId;
}
