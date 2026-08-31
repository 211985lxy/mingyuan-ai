import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { env } from "@/env"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import {
  getAvatarCloneStatusForProvider,
  getVideoTaskStatusForProvider,
} from "@/lib/digital-human-provider"
import {
  handleShanjianAvatarCallback,
  handleShanjianDemoVideoCallback,
  handleShanjianVideoCallback,
  handleShanjianVoiceCallback,
} from "@/lib/digital-human-webhook"
import { logger, generateRequestId } from "@/lib/logger"
import { digitalHumanEventsTotal, webhookTotal } from "@/lib/metrics"
import type { WebhookPayload } from "@/types/shanjian"

export const runtime = "nodejs"
export const maxDuration = 60

const log = logger.child({ component: "webhook-shanjian" })

function authorizeShanjianWebhook(request: NextRequest): boolean {
  const secret = env.SHANJIAN_WEBHOOK_SECRET
  if (!secret) return false
  const provided = request.headers.get("x-webhook-secret")
  if (!provided) return false
  const a = Buffer.from(secret)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: "received" })

  if (!authorizeShanjianWebhook(request)) {
    if (!env.SHANJIAN_WEBHOOK_SECRET) {
      log.error({ requestId }, "SHANJIAN_WEBHOOK_SECRET 未配置，拒绝回调")
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = (await parseJsonRecord(request)) as WebhookPayload
  } catch (error) {
    return apiRequestErrorResponse(request, error)!
  }

  const { taskId, status } = payload
  if (!taskId) return NextResponse.json({ ok: true })

  try {
    const deduped = await redis.set(`webhook:shanjian:${taskId}`, "1", "EX", 86400, "NX")
    if (!deduped) {
      webhookTotal.inc({ type: "duplicate", status })
      return NextResponse.json({ ok: true })
    }
  } catch (error) {
    log.warn({ requestId, error: error instanceof Error ? error.message : "unknown" }, "Redis dedup failed")
  }

  try {
    const avatar = await prisma.avatar.findFirst({ where: { externalTaskId: taskId } })
    if (avatar) {
      const verified = await getAvatarCloneStatusForProvider("shanjian", taskId)
      await handleShanjianAvatarCallback(avatar.id, verified.status, verified.result, verified.errorCode, verified.errorMessage)
      digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: verified.status })
      return NextResponse.json({ ok: true })
    }

    const videoTask = await prisma.videoTask.findFirst({ where: { externalTaskId: taskId } })
    if (videoTask) {
      const verified = await getVideoTaskStatusForProvider("shanjian", taskId)
      await handleShanjianVideoCallback(videoTask, verified.status, verified.result, verified.errorCode, verified.errorMessage)
      digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: verified.status })
      return NextResponse.json({ ok: true })
    }

    const asset = await prisma.asset.findFirst({ where: { externalTaskId: taskId } })
    if (asset) {
      const verified = await getVideoTaskStatusForProvider("shanjian", taskId)
      await handleShanjianVoiceCallback(asset, verified.status, verified.result, verified.errorCode, verified.errorMessage)
      digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: verified.status })
      return NextResponse.json({ ok: true })
    }

    const demoAvatar = await prisma.avatar.findFirst({ where: { demoTaskId: taskId } })
    if (demoAvatar) {
      const verified = await getVideoTaskStatusForProvider("shanjian", taskId)
      await handleShanjianDemoVideoCallback(demoAvatar.id, verified.status, verified.result)
      digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: verified.status })
      return NextResponse.json({ ok: true })
    }

    webhookTotal.inc({ type: "orphan", status })
    return NextResponse.json({ ok: false, error: "Unknown task" }, { status: 404 })
  } catch (error) {
    log.error({ requestId, error: error instanceof Error ? error.stack : "unknown" }, "Webhook processing failed")
    digitalHumanEventsTotal.inc({ provider: "shanjian", event: "provider_error", status: "callback" })
    webhookTotal.inc({ type: "error", status: "error" })
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 502 })
  }
}
