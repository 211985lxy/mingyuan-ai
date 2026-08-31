import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { generateSignedUrl, uploadBufferToOss } from "@/lib/oss";
import { prisma } from "@/lib/prisma";
import { cloneVoice } from "@/lib/shanjian";
import { resolveUpstreamReadableUrl } from "@/lib/upstream-media";

const AUTO_CLONE_VOICE_MODEL = "v1";
const AUTO_CLONE_VOICE_LANGUAGE = "zh";
const EXTRACTED_AUDIO_CONTENT_TYPE = "audio/mpeg";
const EXTRACTED_AUDIO_EXTENSION = ".mp3";
export const MAX_AUTO_VOICE_RETRIES = 3;
const AUTO_VOICE_RETRY_COOLDOWN_MS = 2 * 60 * 1000;
const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".avi",
  ".mkv",
]);
const execFileAsync = promisify(execFile);

function getAvatarVoiceAssetName(
  avatarName: string,
  speakerName?: string | null,
): string {
  const normalizedSpeakerName = speakerName?.trim();
  if (normalizedSpeakerName) return normalizedSpeakerName;
  return `${avatarName}的声音`;
}

function getAvatarVoiceAssetUrl(input: {
  sourceVideoUrl?: string | null;
  demoAudioUrl?: string | null;
  cloneAudioUrl?: string | null;
}): string {
  return (
    input.demoAudioUrl || input.cloneAudioUrl || input.sourceVideoUrl || ""
  );
}

function getVoiceAssetLookup(input: {
  userId: string;
  sourceAvatarId?: string | null;
  name?: string;
  audioUrl?: string;
}) {
  if (input.sourceAvatarId) {
    return {
      userId: input.userId,
      assetType: "voice" as const,
      sourceAvatarId: input.sourceAvatarId,
    };
  }

  return {
    userId: input.userId,
    assetType: "voice" as const,
    name: input.name ?? "",
    url: input.audioUrl ?? "",
  };
}

function getUrlExtension(assetUrl: string): string {
  try {
    return extname(new URL(assetUrl).pathname).toLowerCase();
  } catch {
    return extname(assetUrl).toLowerCase();
  }
}

function isVideoAssetUrl(assetUrl?: string | null): boolean {
  if (!assetUrl) return false;
  return VIDEO_EXTENSIONS.has(getUrlExtension(assetUrl));
}

function canRetryVoiceClone(input: {
  status: string;
  externalTaskId: string | null;
  retryCount: number;
  updatedAt: Date;
  force?: boolean;
}): boolean {
  if (input.status === "ready") return false;
  if (input.force) return true;
  if (input.status === "processing" && input.externalTaskId) return false;
  if (input.retryCount >= MAX_AUTO_VOICE_RETRIES) return false;
  return Date.now() - input.updatedAt.getTime() >= AUTO_VOICE_RETRY_COOLDOWN_MS;
}

async function markAvatarVoiceCloneFailed(input: {
  userId: string;
  avatarName: string;
  sourceAvatarId?: string | null;
  sourceVideoUrl?: string | null;
  speakerName?: string | null;
  errorMessage: string;
}): Promise<void> {
  const name = getAvatarVoiceAssetName(input.avatarName, input.speakerName);

  const existing = await prisma.asset.findFirst({
    where: getVoiceAssetLookup({
      userId: input.userId,
      sourceAvatarId: input.sourceAvatarId,
      name,
      audioUrl: input.sourceVideoUrl ?? "",
    }),
    select: { id: true, retryCount: true },
  });

  const failureData = {
    name,
    assetType: "voice" as const,
    url: input.sourceVideoUrl || "",
    status: "failed" as const,
    errorCode: "VOICE_CLONE_SOURCE_UNAVAILABLE",
    errorMessage: input.errorMessage,
    sourceAvatarId: input.sourceAvatarId ?? null,
    externalTaskId: null,
    externalSpeakerId: null,
  };

  if (existing) {
    await prisma.asset.update({
      where: { id: existing.id },
      data: {
        ...failureData,
        retryCount: { increment: 1 },
      },
    });
    return;
  }

  await prisma.asset.create({
    data: {
      userId: input.userId,
      voiceModel: AUTO_CLONE_VOICE_MODEL,
      retryCount: 1,
      ...failureData,
    },
  });
}

async function extractVoiceCloneAudioFromVideo(input: {
  avatarId: string;
  sourceVideoUrl: string;
}): Promise<string> {
  if (!isVideoAssetUrl(input.sourceVideoUrl)) {
    throw new Error("当前训练素材不是视频，无法自动抽取声音");
  }

  const signedVideoUrl = generateSignedUrl(input.sourceVideoUrl);
  const response = await fetch(signedVideoUrl);

  if (!response.ok) {
    throw new Error(`下载训练视频失败: ${response.status}`);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "avatar-voice-"));
  const sourceExtension = getUrlExtension(input.sourceVideoUrl) || ".mp4";
  const sourcePath = join(tempDir, `source${sourceExtension}`);
  const audioPath = join(tempDir, `voice${EXTRACTED_AUDIO_EXTENSION}`);

  try {
    const sourceBuffer = Buffer.from(await response.arrayBuffer());
    await writeFile(sourcePath, sourceBuffer);

    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      sourcePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-b:a",
      "128k",
      audioPath,
    ]);

    const audioBuffer = await readFile(audioPath);
    return uploadBufferToOss(
      `avatars/${input.avatarId}/voice-source-${Date.now()}.mp3`,
      audioBuffer,
      EXTRACTED_AUDIO_CONTENT_TYPE,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function ensureAvatarVoiceAsset(input: {
  userId: string;
  avatarName: string;
  speakerId: string;
  speakerName?: string | null;
  sourceAvatarId?: string | null;
  sourceVideoUrl?: string | null;
  demoAudioUrl?: string | null;
}): Promise<void> {
  const name = getAvatarVoiceAssetName(input.avatarName, input.speakerName);
  const url = getAvatarVoiceAssetUrl({
    sourceVideoUrl: input.sourceVideoUrl,
    demoAudioUrl: input.demoAudioUrl,
  });

  const existing = await prisma.asset.findFirst({
    where: {
      userId: input.userId,
      assetType: "voice",
      OR: [
        { externalSpeakerId: input.speakerId },
        ...(input.sourceAvatarId
          ? [{ sourceAvatarId: input.sourceAvatarId }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      url: true,
      demoAudioUrl: true,
    },
  });

  if (existing) {
    await prisma.asset.update({
      where: { id: existing.id },
      data: {
        status: "ready",
        externalSpeakerId: input.speakerId,
        errorCode: null,
        errorMessage: null,
        externalTaskId: null,
        sourceAvatarId: input.sourceAvatarId ?? null,
        ...(existing.name ? {} : { name }),
        ...(existing.url || !url ? {} : { url }),
        ...(input.demoAudioUrl && input.demoAudioUrl !== existing.demoAudioUrl
          ? { demoAudioUrl: input.demoAudioUrl }
          : {}),
      },
    });
    return;
  }

  await prisma.asset.create({
    data: {
      userId: input.userId,
      sourceAvatarId: input.sourceAvatarId ?? null,
      name,
      assetType: "voice",
      url,
      status: "ready",
      externalSpeakerId: input.speakerId,
      demoAudioUrl: input.demoAudioUrl ?? null,
    },
  });
}

export async function createAvatarVoiceCloneAsset(input: {
  userId: string;
  avatarName: string;
  speakerName?: string | null;
  sourceAvatarId?: string | null;
  audioUrl: string;
  sourceVideoUrl?: string | null;
}): Promise<void> {
  const name = getAvatarVoiceAssetName(input.avatarName, input.speakerName);

  const existing = await prisma.asset.findFirst({
    where: getVoiceAssetLookup({
      userId: input.userId,
      sourceAvatarId: input.sourceAvatarId,
      name,
      audioUrl: input.audioUrl,
    }),
    select: { id: true, status: true, externalTaskId: true },
  });

  if (existing?.externalTaskId || existing?.status === "ready") {
    return;
  }

  const taskId = await cloneVoice({
    audioUrl: resolveUpstreamReadableUrl(input.audioUrl, "audioUrl"),
    model: AUTO_CLONE_VOICE_MODEL,
    language: AUTO_CLONE_VOICE_LANGUAGE,
  });

  const processingData = {
    status: "processing" as const,
    voiceModel: AUTO_CLONE_VOICE_MODEL,
    externalTaskId: taskId,
    externalSpeakerId: null,
    errorCode: null,
    errorMessage: null,
    sourceAvatarId: input.sourceAvatarId ?? null,
    url: input.audioUrl || input.sourceVideoUrl || "",
  };

  if (existing) {
    await prisma.asset.update({
      where: { id: existing.id },
      data: {
        ...processingData,
        retryCount: { increment: 1 },
      },
    });
    return;
  }

  await prisma.asset.create({
    data: {
      userId: input.userId,
      name,
      assetType: "voice",
      retryCount: 1,
      ...processingData,
    },
  });
}

export async function createAvatarVoiceCloneAssetFromVideo(input: {
  userId: string;
  avatarId: string;
  avatarName: string;
  speakerName?: string | null;
  sourceVideoUrl?: string | null;
  force?: boolean;
}): Promise<boolean> {
  const existing = await prisma.asset.findFirst({
    where: {
      userId: input.userId,
      assetType: "voice",
      sourceAvatarId: input.avatarId,
    },
    select: {
      status: true,
      externalTaskId: true,
      retryCount: true,
      updatedAt: true,
    },
  });

  if (
    existing &&
    !canRetryVoiceClone({
      status: existing.status,
      externalTaskId: existing.externalTaskId,
      retryCount: existing.retryCount,
      updatedAt: existing.updatedAt,
      force: input.force,
    })
  ) {
    return false;
  }

  if (!input.sourceVideoUrl) {
    await markAvatarVoiceCloneFailed({
      userId: input.userId,
      avatarName: input.avatarName,
      sourceAvatarId: input.avatarId,
      speakerName: input.speakerName,
      errorMessage: "缺少训练视频，无法自动克隆专属声音",
    });
    return true;
  }

  try {
    const cloneAudioUrl = await extractVoiceCloneAudioFromVideo({
      avatarId: input.avatarId,
      sourceVideoUrl: input.sourceVideoUrl,
    });

    await createAvatarVoiceCloneAsset({
      userId: input.userId,
      avatarName: input.avatarName,
      speakerName: input.speakerName,
      sourceAvatarId: input.avatarId,
      audioUrl: cloneAudioUrl,
      sourceVideoUrl: input.sourceVideoUrl,
    });
    return true;
  } catch (error) {
    await markAvatarVoiceCloneFailed({
      userId: input.userId,
      avatarName: input.avatarName,
      sourceAvatarId: input.avatarId,
      sourceVideoUrl: input.sourceVideoUrl,
      speakerName: input.speakerName,
      errorMessage:
        error instanceof Error ? error.message : "自动克隆专属声音失败",
    });
    throw error;
  }
}

export async function ensureUserAvatarVoiceAssets(
  userId: string,
): Promise<void> {
  const [avatars, voiceAssets] = await Promise.all([
    prisma.avatar.findMany({
      where: {
        userId,
        status: "ready",
        externalSpeakerId: { not: null },
      },
      select: {
        id: true,
        name: true,
        sourceVideoUrl: true,
        externalSpeakerId: true,
        speakerName: true,
      },
    }),
    prisma.asset.findMany({
      where: {
        userId,
        assetType: "voice",
        externalSpeakerId: { not: null },
      },
      select: { externalSpeakerId: true },
    }),
  ]);

  const existingSpeakerIds = new Set(
    voiceAssets
      .map((asset) => asset.externalSpeakerId)
      .filter((speakerId): speakerId is string => Boolean(speakerId)),
  );

  for (const avatar of avatars) {
    if (
      !avatar.externalSpeakerId ||
      existingSpeakerIds.has(avatar.externalSpeakerId)
    ) {
      continue;
    }

    await ensureAvatarVoiceAsset({
      userId,
      avatarName: avatar.name,
      speakerId: avatar.externalSpeakerId,
      speakerName: avatar.speakerName,
      sourceAvatarId: avatar.id,
      sourceVideoUrl: avatar.sourceVideoUrl,
    });

    existingSpeakerIds.add(avatar.externalSpeakerId);
  }
}
