import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { env } from "@/env"
import { triggerAvatarDemoVideo } from "@/lib/avatar-demo"
import {
  createAvatarVoiceCloneAssetFromVideo,
  ensureAvatarVoiceAsset,
} from "@/lib/avatar-voice-assets"
import {
  getAvatarCloneTaskInfo,
  getVideoTaskInfo,
} from "@/lib/chanjing"
import { normalizeDigitalHumanProvider } from "@/lib/digital-human-provider"
import { releaseProviderSlot } from "@/lib/digital-human-semaphore"
import { logger, generateRequestId } from "@/lib/logger"
import { transferFromUrl } from "@/lib/oss"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { digitalHumanEventsTotal, webhookTotal } from "@/lib/metrics"
import {
  settleVideoTaskFailure,
  settleVideoTaskSuccess,
} from "@/lib/video-task-settlement"
import type { ChanjingWebhookPayload } from "@/types/chanjing"

export const runtime = "nodejs"
export const maxDuration = 60

const log = logger.child({ component: "webhook-chanjing" })

function authorizeChanjingWebhook(request: NextRequest): boolean {
  const secret = env.CHANJING_WEBHOOK_SECRET
  if (!secret) return true
  const provided = request.headers.get("x-webhook-secret")
  if (!provided) return true
  const a = Buffer.from(secret)
  const b = Buffer.from(provided)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  digitalHumanEventsTotal.inc({ provider: "chanjing", event: "callback", status: "received" })

  if (!authorizeChanjingWebhook(request)) {
    log.warn({ requestId }, "Webhook 鉴权失败")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: ChanjingWebhookPayload
  try {
    payload = (await parseJsonRecord(request)) as ChanjingWebhookPayload
  } catch (error) {
    log.warn({ requestId, error: error instanceof Error ? error.message : "unknown" }, "Webhook payload parse failed")
    return apiRequestErrorResponse(request, error)!
  }

  const entityId = payload.id
  if (!entityId) {
    log.warn({ requestId }, "Webhook received without id")
    return NextResponse.json({ ok: true })
  }

  const reqLog = log.child({ requestId, entityId })

  try {
    const set = await redis.set(`webhook:chanjing:${entityId}`, "1", "EX", 86400, "NX")
    if (!set) {
      reqLog.info("Duplicate webhook, skipping")
      webhookTotal.inc({ type: "duplicate", status: String(payload.status ?? "unknown") })
      return NextResponse.json({ ok: true })
    }
  } catch (error) {
    reqLog.warn({ error: error instanceof Error ? error.message : "unknown" }, "Redis dedup failed")
  }

  try {
    const avatar = await prisma.avatar.findFirst({ where: { externalTaskId: entityId } })
    if (avatar) {
      const mapped = await getAvatarCloneTaskInfo(entityId)
      await handleAvatarCallback(avatar.id, mapped)
      digitalHumanEventsTotal.inc({ provider: "chanjing", event: "callback", status: mapped.status })
      return NextResponse.json({ ok: true })
    }

    const videoTask = await prisma.videoTask.findFirst({ where: { externalTaskId: entityId } })
    const demoAvatar = await prisma.avatar.findFirst({ where: { demoTaskId: entityId } })
    if (videoTask || demoAvatar) {
      const mapped = await getVideoTaskInfo(entityId)
      if (videoTask) {
        await handleVideoCallback(videoTask, mapped)
        digitalHumanEventsTotal.inc({ provider: "chanjing", event: "callback", status: mapped.status })
        return NextResponse.json({ ok: true })
      }
      if (demoAvatar) {
        await handleDemoVideoCallback(demoAvatar.id, mapped)
        return NextResponse.json({ ok: true })
      }
    }

    reqLog.warn("No entity found for webhook id")
    webhookTotal.inc({ type: "orphan", status: String(payload.status ?? "unknown") })
    return NextResponse.json({ ok: false, error: "Unknown task" }, { status: 404 })
  } catch (error) {
    reqLog.error({ error: error instanceof Error ? error.stack : "unknown" }, "Webhook processing failed")
    digitalHumanEventsTotal.inc({ provider: "chanjing", event: "provider_error", status: "callback" })
    webhookTotal.inc({ type: "error", status: "error" })
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 502 })
}

async function handleAvatarCallback(
  avatarId: string,
  mapped: Awaited<ReturnType<typeof getAvatarCloneTaskInfo>>,
) {
  const { status, result, errorCode, errorMessage } = mapped
  const avatar = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: {
      userId: true,
      name: true,
      sourceVideoUrl: true,
      provider: true,
    },
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

    const speakerName = `${avatar.name ?? "数字人"}的声音`
    const ossCoverUrl = result.coverUrl
      ? await transferFromUrl(result.coverUrl, `avatars/${avatarId}/cover.jpg`)
      : null

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

    if (result.virtualmanId && result.speakerId) {
      triggerAvatarDemoVideo({
        avatarId,
        virtualmanId: result.virtualmanId,
        speakerId: result.speakerId,
        logPrefix: "[webhook-chanjing]",
      }).catch((err) => console.error("[webhook-chanjing] Demo trigger failed", err))
    }
    return
  }

  if (status === "failed") {
    const updated = await prisma.avatar.updateMany({
      where: { id: avatarId, status: "cloning" },
      data: { status: "failed", errorCode: errorCode ?? null, errorMessage: errorMessage ?? null },
    })
    if (updated.count > 0) await releaseProviderSlot(provider)
  }
}

async function handleVideoCallback(
  videoTask: { id: string; status: string },
  mapped: Awaited<ReturnType<typeof getVideoTaskInfo>>,
) {
  if (videoTask.status === "completed" || videoTask.status === "failed") return
  if (mapped.status === "succeed") {
    await settleVideoTaskSuccess({
      taskId: videoTask.id,
      result: {
        videoUrl: mapped.result?.videoUrl,
        coverUrl: mapped.result?.coverUrl,
        duration: mapped.result?.duration,
      },
      source: "webhook",
    })
    return
  }
  if (mapped.status === "failed") {
    await settleVideoTaskFailure({
      taskId: videoTask.id,
      errorCode: mapped.errorCode ?? null,
      errorMessage: mapped.errorMessage ?? null,
      source: "webhook",
    })
  }
}

async function handleDemoVideoCallback(
  avatarId: string,
  mapped: Awaited<ReturnType<typeof getVideoTaskInfo>>,
) {
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
