import { prisma } from "@/lib/prisma"
import { transferFromUrl } from "@/lib/oss"
import { triggerAvatarDemoVideo } from "@/lib/avatar-demo"
import {
  ensureAvatarVoiceAsset,
  createAvatarVoiceCloneAsset,
  createAvatarVoiceCloneAssetFromVideo,
} from "@/lib/avatar-voice-assets"
import {
  normalizeDigitalHumanProvider,
} from "@/lib/digital-human-provider"
import { releaseProviderSlot } from "@/lib/digital-human-semaphore"
import {
  settleVideoTaskFailure,
  settleVideoTaskSuccess,
} from "@/lib/video-task-settlement"
import { getVideoTaskInfo } from "@/lib/chanjing"
import type { WebhookPayload } from "@/types/shanjian"

type Result = WebhookPayload["result"]

export async function handleShanjianAvatarCallback(
  avatarId: string,
  status: string,
  result?: Result,
  errorCode?: string,
  errorMessage?: string,
): Promise<void> {
  const avatar = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { userId: true, name: true, sourceVideoUrl: true, provider: true },
  })
  if (!avatar) return
  const provider = normalizeDigitalHumanProvider(avatar.provider)

  if (status === "succeed") {
    if (!result?.virtualmanId) {
      const updated = await prisma.avatar.updateMany({
        where: { id: avatarId, status: "cloning" },
        data: {
          status: "failed",
          errorCode: "MISSING_VIRTUALMAN_ID",
          errorMessage: "克隆完成但未返回数字人 ID，请重新克隆",
        },
      })
      if (updated.count > 0) await releaseProviderSlot(provider)
      return
    }

    const ossCoverUrl = result.coverUrl
      ? await transferFromUrl(result.coverUrl, `avatars/${avatarId}/cover.jpg`)
      : null
    const speakerName = `${avatar.name}的声音`
    const updated = await prisma.avatar.updateMany({
      where: { id: avatarId, status: "cloning" },
      data: {
        status: "ready",
        externalVirtualmanId: result.virtualmanId,
        externalSpeakerId: result.speakerId ?? null,
        coverUrl: ossCoverUrl,
        speakerName,
      },
    })
    if (updated.count === 0) return
    await releaseProviderSlot(provider)

    if (result.speakerId) {
      await ensureAvatarVoiceAsset({
        userId: avatar.userId,
        avatarName: avatar.name,
        speakerId: result.speakerId,
        speakerName,
        sourceAvatarId: avatarId,
        sourceVideoUrl: avatar.sourceVideoUrl,
        demoAudioUrl: result.demoAudioUrl,
      })
    } else if (result.audioUrl) {
      await createAvatarVoiceCloneAsset({
        userId: avatar.userId,
        avatarName: avatar.name,
        speakerName,
        sourceAvatarId: avatarId,
        audioUrl: result.audioUrl,
        sourceVideoUrl: avatar.sourceVideoUrl,
      })
    } else if (avatar.sourceVideoUrl) {
      await createAvatarVoiceCloneAssetFromVideo({
        userId: avatar.userId,
        avatarId,
        avatarName: avatar.name,
        speakerName,
        sourceVideoUrl: avatar.sourceVideoUrl,
      })
    }

    if (result.speakerId) {
      triggerAvatarDemoVideo({
        avatarId,
        virtualmanId: result.virtualmanId,
        speakerId: result.speakerId,
        logPrefix: "[webhook-shanjian]",
      }).catch((error) => console.error("[webhook-shanjian] Demo trigger failed", error))
    }
    return
  }

  if (status === "failed") {
    const updated = await prisma.avatar.updateMany({
      where: { id: avatarId, status: "cloning" },
      data: {
        status: "failed",
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
      },
    })
    if (updated.count > 0) await releaseProviderSlot(provider)
  }
}

export async function handleShanjianVideoCallback(
  videoTask: { id: string; status: string },
  status: string,
  result?: Result,
  errorCode?: string,
  errorMessage?: string,
): Promise<void> {
  if (videoTask.status === "completed" || videoTask.status === "failed") return
  if (status === "succeed") {
    await settleVideoTaskSuccess({
      taskId: videoTask.id,
      result: {
        videoUrl: result?.videoUrl,
        coverUrl: result?.coverUrl,
        duration: result?.duration,
      },
      source: "webhook",
    })
  } else if (status === "failed") {
    await settleVideoTaskFailure({
      taskId: videoTask.id,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      source: "webhook",
    })
  }
}

export async function handleShanjianVoiceCallback(
  asset: { id: string; name: string; sourceAvatarId: string | null },
  status: string,
  result?: Result,
  errorCode?: string,
  errorMessage?: string,
): Promise<void> {
  if (status === "succeed") {
    const updated = await prisma.asset.updateMany({
      where: { id: asset.id, status: "processing" },
      data: {
        status: "ready",
        externalSpeakerId: result?.speakerId ?? null,
        demoAudioUrl: result?.demoAudioUrl ?? null,
        errorCode: null,
        errorMessage: null,
      },
    })
    if (updated.count === 0 || !result?.speakerId || !asset.sourceAvatarId) return

    const avatar = await prisma.avatar.findUnique({
      where: { id: asset.sourceAvatarId },
      select: {
        externalSpeakerId: true,
        externalVirtualmanId: true,
        demoTaskId: true,
        speakerName: true,
      },
    })
    if (!avatar) return
    if (!avatar.externalSpeakerId) {
      await prisma.avatar.update({
        where: { id: asset.sourceAvatarId },
        data: {
          externalSpeakerId: result.speakerId,
          speakerName: avatar.speakerName || asset.name,
        },
      })
    }
    if (avatar.externalVirtualmanId && !avatar.demoTaskId) {
      await triggerAvatarDemoVideo({
        avatarId: asset.sourceAvatarId,
        virtualmanId: avatar.externalVirtualmanId,
        speakerId: avatar.externalSpeakerId || result.speakerId,
        logPrefix: "[webhook-shanjian]",
      })
    }
    return
  }

  if (status === "failed") {
    await prisma.asset.updateMany({
      where: { id: asset.id, status: "processing" },
      data: {
        status: "failed",
        externalTaskId: null,
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
      },
    })
  }
}

export async function handleShanjianDemoVideoCallback(
  avatarId: string,
  status: string,
  result?: Result,
): Promise<void> {
  if (status === "succeed") {
    const demoVideoUrl = result?.videoUrl
      ? await transferFromUrl(result.videoUrl, `avatars/${avatarId}/demo.mp4`)
      : null
    const coverUrl = result?.coverUrl
      ? await transferFromUrl(result.coverUrl, `avatars/${avatarId}/demo-cover.jpg`)
      : null
    await prisma.avatar.update({
      where: { id: avatarId },
      data: { demoVideoUrl, ...(coverUrl ? { coverUrl } : {}) },
    })
  } else if (status === "failed") {
    await prisma.avatar.update({ where: { id: avatarId }, data: { demoTaskId: null } })
  }
}

export async function handleChanjingDemoVideoCallback(
  avatarId: string,
  mapped: Awaited<ReturnType<typeof getVideoTaskInfo>>,
): Promise<void> {
  if (mapped.status === "succeed") {
    const demoVideoUrl = mapped.result?.videoUrl
      ? await transferFromUrl(mapped.result.videoUrl, `avatars/${avatarId}/demo.mp4`)
      : null
    const coverUrl = mapped.result?.coverUrl
      ? await transferFromUrl(mapped.result.coverUrl, `avatars/${avatarId}/demo-cover.jpg`)
      : null
    await prisma.avatar.update({
      where: { id: avatarId },
      data: { demoVideoUrl, ...(coverUrl ? { coverUrl } : {}) },
    })
    return
  }
  if (mapped.status === "failed") {
    await prisma.avatar.update({ where: { id: avatarId }, data: { demoTaskId: null } })
  }
}
