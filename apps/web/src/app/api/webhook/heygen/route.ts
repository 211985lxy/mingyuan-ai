import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { parseJsonRecord } from "@/lib/api-contract"
import { env } from "@/env"
import { triggerAvatarDemoVideo } from "@/lib/avatar-demo"
import {
  getVideoTaskStatusForProvider,
  normalizeDigitalHumanProvider,
} from "@/lib/digital-human-provider"
import { releaseProviderSlot } from "@/lib/digital-human-semaphore"
import { logger, generateRequestId } from "@/lib/logger"
import { digitalHumanEventsTotal, webhookTotal } from "@/lib/metrics"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import {
  settleVideoTaskFailure,
  settleVideoTaskSuccess,
} from "@/lib/video-task-settlement"
import {
  HEYGEN_WEBHOOK_SIGNATURE_HEADER,
  parseHeygenWebhookEvent,
} from "@/lib/heygen"

export const runtime = "nodejs"
export const maxDuration = 60

const log = logger.child({ component: "webhook-heygen" })

/**
 * HeyGen webhook 回调。
 *
 * 与蝉镜回调同一套防线，顺序不可调换：
 * 1. HMAC-SHA256 验签（raw body），无 secret 或签名不符一律 401——fail-closed
 * 2. Redis 幂等去重（event_id，24h）
 * 3. **回调查询复核**：推送体不可信，以我方主动 GET /v3/videos/{id} 的结果结算
 * 4. 结算（成功转存 / 失败归因），并释放供应商并发槽
 */

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = env.HEYGEN_WEBHOOK_SECRET || ""
  if (!secret) return false
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(expected, "hex")
  const b = Buffer.from((signature ?? "").trim().toLowerCase(), "hex")
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const reqLog = log.child({ requestId })

  // ─── 1. 验签：必须先于一切业务逻辑 ───
  const rawBody = await request.text()
  const signature =
    request.headers.get(HEYGEN_WEBHOOK_SIGNATURE_HEADER) ??
    request.headers.get("x-heygen-signature")
  if (!verifySignature(rawBody, signature)) {
    reqLog.warn("Webhook signature verification failed")
    webhookTotal.inc({ type: "heygen", status: "bad_signature" })
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // ─── 2. 解析事件 ───
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    reqLog.warn("Webhook payload is not valid JSON")
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const event = parseHeygenWebhookEvent(parsed)
  if (!event?.event_type) {
    reqLog.warn("Webhook event missing event_type")
    return NextResponse.json({ ok: true })
  }

  const eventType = event.event_type
  const eventId = event.event_id ?? `${eventType}:${event.event_data?.video_id ?? "unknown"}`
  const videoId = typeof event.event_data?.video_id === "string" ? event.event_data.video_id : null
  const reqLog2 = log.child({ requestId, eventId, eventType })

  // 与出片无关的事件：确认收到即可
  if (!eventType.startsWith("avatar_video.")) {
    reqLog2.info("Non-video webhook event acknowledged")
    webhookTotal.inc({ type: "heygen", status: "ignored" })
    return NextResponse.json({ ok: true })
  }
  if (!videoId) {
    reqLog2.warn("Video webhook without video_id")
    webhookTotal.inc({ type: "heygen", status: "missing_video_id" })
    return NextResponse.json({ ok: true })
  }

  // ─── 3. 幂等去重 ───
  try {
    const set = await redis.set(`webhook:heygen:${eventId}`, "1", "EX", 86400, "NX")
    if (!set) {
      reqLog2.info("Duplicate webhook, skipping")
      webhookTotal.inc({ type: "duplicate", status: eventType })
      return NextResponse.json({ ok: true })
    }
  } catch (error) {
    reqLog2.warn({ error: error instanceof Error ? error.message : "unknown" }, "Redis dedup failed")
  }

  try {
    return await processVideoWebhook({ videoId, eventType })
  } catch (error) {
    reqLog2.error({ error: error instanceof Error ? error.stack : "unknown" }, "Webhook processing failed")
    digitalHumanEventsTotal.inc({ provider: "heygen", event: "provider_error", status: "callback" })
    webhookTotal.inc({ type: "error", status: "error" })
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 502 })
}

type ProcessResult = { status: number; body: Record<string, unknown> }

/**
 * 定位任务 → 回调查询复核 → 结算。
 *
 * 推送体不可信：始终以我方主动查询供应商的结果结算。
 * 供应商一致性由 provider 字段保证：非 heygen 的任务不会被该端点结算。
 */
async function processVideoWebhook(input: {
  videoId: string
  eventType: string
}): Promise<ProcessResult> {
  const { videoId, eventType } = input
  const videoTask = await prisma.videoTask.findFirst({ where: { externalTaskId: videoId } })
  const demoAvatar = await prisma.avatar.findFirst({ where: { demoTaskId: videoId } })
  if (!videoTask && !demoAvatar) {
    log.warn({ videoId }, "No entity found for webhook video id")
    webhookTotal.inc({ type: "orphan", status: eventType })
    return { status: 404, body: { ok: false, error: "Unknown task" } }
  }

  if (videoTask && normalizeDigitalHumanProvider(videoTask.provider) !== "heygen") {
    log.warn({ taskId: videoTask.id, provider: videoTask.provider }, "Provider mismatch, skipping")
    webhookTotal.inc({ type: "heygen", status: "provider_mismatch" })
    return { status: 200, body: { ok: true } }
  }

  const mapped = await getVideoTaskStatusForProvider("heygen", videoId)

  if (videoTask) {
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
    } else if (mapped.status === "failed") {
      await settleVideoTaskFailure({
        taskId: videoTask.id,
        errorCode: mapped.errorCode ?? null,
        errorMessage: mapped.errorMessage ?? null,
        source: "webhook",
      })
    }
    await releaseProviderSlot("heygen")
    digitalHumanEventsTotal.inc({ provider: "heygen", event: "callback", status: mapped.status })
    return { status: 200, body: { ok: true } }
  }

  // demo 视频素材更新（不经结算链路）
  await prisma.avatar.update({
    where: { id: demoAvatar!.id },
    data: {
      demoVideoUrl: mapped.result?.videoUrl ?? null,
      ...(mapped.status === "failed" ? { demoTaskId: null } : {}),
    },
  })
  digitalHumanEventsTotal.inc({ provider: "heygen", event: "callback", status: mapped.status })
  return { status: 200, body: { ok: true } }
}
