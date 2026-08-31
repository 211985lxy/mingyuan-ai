import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { env } from "@/env"
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { transferFromUrl } from "@/lib/oss";
import { triggerAvatarDemoVideo } from "@/lib/avatar-demo";
import {
  settleVideoTaskFailure,
  settleVideoTaskSuccess,
} from "@/lib/video-task-settlement";
import {
  ensureAvatarVoiceAsset,
  createAvatarVoiceCloneAsset,
  createAvatarVoiceCloneAssetFromVideo,
} from "@/lib/avatar-voice-assets";
import { logger, generateRequestId } from "@/lib/logger";
import { digitalHumanEventsTotal, webhookTotal } from "@/lib/metrics";
import {
  getAvatarCloneStatusForProvider,
  getVideoTaskStatusForProvider,
  normalizeDigitalHumanProvider,
} from "@/lib/digital-human-provider";
import { releaseProviderSlot } from "@/lib/digital-human-semaphore";
import type { WebhookPayload } from "@/types/shanjian";

export const runtime = "nodejs";
export const maxDuration = 60;

const log = logger.child({ component: "webhook-shanjian" });

/**
 * 共享密钥签名校验:山见回调必须带 X-Webhook-Secret 头,
 * 值等于 SHANJIAN_WEBHOOK_SECRET。未配置 secret 时返回 503(fail-closed)。
 * 使用 timingSafeEqual 防时序攻击。
 */
function authorizeShanjianWebhook(request: NextRequest): boolean {
  const secret = env.SHANJIAN_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("x-webhook-secret");
  if (!provided) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── POST /api/webhook/shanjian ─────────────────────────

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: "received" });

  if (!authorizeShanjianWebhook(request)) {
    if (!env.SHANJIAN_WEBHOOK_SECRET) {
      log.error({ requestId }, "SHANJIAN_WEBHOOK_SECRET 未配置,拒绝回调。上线前必须在山见回调配置加上 X-Webhook-Secret 头并配置本环境变量。");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
    }
    log.warn({ requestId }, "Webhook 鉴权失败");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await parseJsonRecord(request)) as WebhookPayload;
  } catch (error) {
    log.warn({ requestId, error: error instanceof Error ? error.message : "unknown" }, "Webhook payload parse failed");
    return apiRequestErrorResponse(request, error)!;
  }

  const { taskId, status } = payload;

  if (!taskId) {
    log.warn({ requestId }, "Webhook received without taskId");
    return NextResponse.json({ ok: true });
  }

  const reqLog = log.child({ requestId, taskId, status });

  // Redis dedup: SET NX with 24h expiry
  try {
    const set = await redis.set(`webhook:shanjian:${taskId}`, "1", "EX", 86400, "NX");
    if (!set) {
      reqLog.info("Duplicate webhook, skipping");
      webhookTotal.inc({ type: "duplicate", status });
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    reqLog.warn({ error: error instanceof Error ? error.message : "unknown" }, "Redis dedup failed, continuing with DB backup");
  }

  try {
    // Dispatch: find which entity this taskId belongs to
    const avatar = await prisma.avatar.findFirst({
      where: { externalTaskId: taskId },
    });
    if (avatar) {
      const verified = await getAvatarCloneStatusForProvider("shanjian", taskId);
      await handleAvatarCallback(
        avatar.id,
        verified.status,
        verified.result,
        verified.errorCode,
        verified.errorMessage,
      );
      digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: verified.status });
      return NextResponse.json({ ok: true });
    }

    const videoTask = await prisma.videoTask.findFirst({
      where: { externalTaskId: taskId },
    });
    if (videoTask) {
      const verified = await getVideoTaskStatusForProvider("shanjian", taskId);
      await handleVideoCallback(
        videoTask,
        verified.status,
        verified.result,
        verified.errorCode,
        verified.errorMessage,
      );
      digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: verified.status });
      return NextResponse.json({ ok: true });
    }

    const asset = await prisma.asset.findFirst({
      where: { externalTaskId: taskId },
    });
    if (asset) {
      const verified = await getVideoTaskStatusForProvider("shanjian", taskId);
      await handleVoiceCallback(asset, verified.status, verified.result, verified.errorCode, verified.errorMessage);
      digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: verified.status });
      return NextResponse.json({ ok: true });
    }

    // Check if this is a demo video task
    const demoAvatar = await prisma.avatar.findFirst({
      where: { demoTaskId: taskId },
    });
    if (demoAvatar) {
      const verified = await getVideoTaskStatusForProvider("shanjian", taskId);
      await handleDemoVideoCallback(demoAvatar.id, verified.status, verified.result);
      digitalHumanEventsTotal.inc({ provider: "shanjian", event: "callback", status: verified.status });
      return NextResponse.json({ ok: true });
    }

    reqLog.warn("No entity found for webhook taskId");
    webhookTotal.inc({ type: "orphan", status });
    return NextResponse.json({ ok: false, error: "Unknown task" }, { status: 404 });
  } catch (error) {
    reqLog.error({ error: error instanceof Error ? error.stack : "unknown" }, "Webhook processing failed");
    digitalHumanEventsTotal.inc({ provider: "shanjian", event: "provider_error", status: "callback" });
    webhookTotal.inc({ type: "error", status: "error" });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 502 });
}

// ─── Avatar Callback ────────────────────────────────────
// Uses conditional update: only updates if status is still "cloning"
// This prevents race conditions with poll-tasks cron

async function handleAvatarCallback(
  avatarId: string,
  status: string,
  result?: WebhookPayload["result"],
  errorCode?: string,
  errorMessage?: string,
) {
  const avatar = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { userId: true, name: true, sourceVideoUrl: true, provider: true },
  });
  if (!avatar) return;
  const provider = normalizeDigitalHumanProvider(avatar.provider);

  if (status === "succeed") {
    // virtualmanId is required for the avatar to be usable — if absent, treat as failed
    if (!result?.virtualmanId) {
      const updated = await prisma.avatar.updateMany({
        where: { id: avatarId, status: "cloning" },
        data: {
          status: "failed",
          errorCode: "MISSING_VIRTUALMAN_ID",
          errorMessage: "克隆完成但未返回数字人 ID，请重新克隆",
        },
      });
      if (updated.count > 0) await releaseProviderSlot(provider);
      return;
    }

    // Transfer cover image to OSS if available
    let ossCoverUrl: string | undefined;
    if (result?.coverUrl) {
      ossCoverUrl = await transferFromUrl(
        result.coverUrl,
        `avatars/${avatarId}/cover.jpg`,
      );
    }

    const speakerName = `${avatar.name}的声音`;

    const updated = await prisma.avatar.updateMany({
      where: { id: avatarId, status: "cloning" },
      data: {
        status: "ready",
        externalVirtualmanId: result.virtualmanId,
        externalSpeakerId: result?.speakerId ?? null,
        coverUrl: ossCoverUrl ?? null,
        speakerName,
      },
    });

    if (updated.count === 0) {
      return;
    }

    await releaseProviderSlot(provider);

    if (result?.speakerId) {
      await ensureAvatarVoiceAsset({
        userId: avatar.userId,
        avatarName: avatar.name,
        speakerId: result.speakerId,
        speakerName,
        sourceAvatarId: avatarId,
        sourceVideoUrl: avatar.sourceVideoUrl,
        demoAudioUrl: result.demoAudioUrl,
      });
    } else if (result?.audioUrl) {
      await createAvatarVoiceCloneAsset({
        userId: avatar.userId,
        avatarName: avatar.name,
        speakerName,
        sourceAvatarId: avatarId,
        audioUrl: result.audioUrl,
        sourceVideoUrl: avatar.sourceVideoUrl,
      });
    } else if (avatar.sourceVideoUrl) {
      await createAvatarVoiceCloneAssetFromVideo({
        userId: avatar.userId,
        avatarId,
        avatarName: avatar.name,
        speakerName,
        sourceVideoUrl: avatar.sourceVideoUrl,
      });
    }

    // Trigger demo video generation (non-blocking, best-effort)
    if (result?.virtualmanId && result?.speakerId) {
      triggerAvatarDemoVideo({
        avatarId,
        virtualmanId: result.virtualmanId,
        speakerId: result.speakerId,
        logPrefix: "[webhook]",
      }).catch((err) =>
        console.error(
          `[webhook] Demo video trigger failed for avatar ${avatarId}:`,
          err,
        ),
      );
    }
  } else if (status === "failed") {
    const updated = await prisma.avatar.updateMany({
      where: { id: avatarId, status: "cloning" },
      data: {
        status: "failed",
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
      },
    });
    if (updated.count > 0) await releaseProviderSlot(provider);
  }
}

// ─── Video Callback ─────────────────────────────────────
// Uses conditional update: only updates if status is still "processing"

async function handleVideoCallback(
  videoTask: {
    id: string;
    status: string;
  },
  status: string,
  result?: WebhookPayload["result"],
  errorCode?: string,
  errorMessage?: string,
) {
  // Skip if already terminal
  if (videoTask.status === "completed" || videoTask.status === "failed") return;

  if (status === "succeed") {
    await settleVideoTaskSuccess({
      taskId: videoTask.id,
      result: {
        videoUrl: result?.videoUrl,
        coverUrl: result?.coverUrl,
        duration: result?.duration,
      },
      source: "webhook",
    });
  } else if (status === "failed") {
    await settleVideoTaskFailure({
      taskId: videoTask.id,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      source: "webhook",
    });
  }
}

// ─── Voice Callback ─────────────────────────────────────
// Uses conditional update: only updates if status is still "processing"

async function handleVoiceCallback(
  asset: {
    id: string;
    name: string;
    sourceAvatarId: string | null;
  },
  status: string,
  result?: WebhookPayload["result"],
  errorCode?: string,
  errorMessage?: string,
) {
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
    });

    if (updated.count === 0 || !result?.speakerId || !asset.sourceAvatarId) {
      return;
    }

    const avatar = await prisma.avatar.findUnique({
      where: { id: asset.sourceAvatarId },
      select: {
        externalSpeakerId: true,
        externalVirtualmanId: true,
        demoTaskId: true,
        speakerName: true,
      },
    });

    if (!avatar) return;

    if (!avatar.externalSpeakerId) {
      await prisma.avatar.update({
        where: { id: asset.sourceAvatarId },
        data: {
          externalSpeakerId: result.speakerId,
          speakerName: avatar.speakerName || asset.name,
        },
      });
    }

    const resolvedSpeakerId = avatar.externalSpeakerId || result.speakerId;
    if (avatar.externalVirtualmanId && !avatar.demoTaskId) {
      await triggerAvatarDemoVideo({
        avatarId: asset.sourceAvatarId,
        virtualmanId: avatar.externalVirtualmanId,
        speakerId: resolvedSpeakerId,
        logPrefix: "[webhook]",
      });
    }
  } else if (status === "failed") {
    await prisma.asset.updateMany({
      where: { id: asset.id, status: "processing" },
      data: {
        status: "failed",
        externalTaskId: null,
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
      },
    });
  }
}

// ─── Demo Video Callback ───────────────────────────────

async function handleDemoVideoCallback(
  avatarId: string,
  status: string,
  result?: WebhookPayload["result"],
) {
  if (status === "succeed") {
    let ossVideoUrl: string | undefined;
    let ossCoverUrl: string | undefined;

    if (result?.videoUrl) {
      ossVideoUrl = await transferFromUrl(
        result.videoUrl,
        `avatars/${avatarId}/demo.mp4`,
      );
    }
    if (result?.coverUrl) {
      ossCoverUrl = await transferFromUrl(
        result.coverUrl,
        `avatars/${avatarId}/demo-cover.jpg`,
      );
    }

    await prisma.avatar.update({
      where: { id: avatarId },
      data: {
        demoVideoUrl: ossVideoUrl ?? null,
        ...(ossCoverUrl ? { coverUrl: ossCoverUrl } : {}),
      },
    });
  } else if (status === "failed") {
    // Non-critical: just clear demoTaskId so we don't keep polling
    await prisma.avatar.update({
      where: { id: avatarId },
      data: { demoTaskId: null },
    });
    console.warn(`[webhook] Demo video failed for avatar ${avatarId}`);
  }
}
