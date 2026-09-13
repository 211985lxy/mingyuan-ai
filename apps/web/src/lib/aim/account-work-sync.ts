import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { env } from "@/env"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { fetchDouyinRecentVideos, type DouyinToken, type DouyinVideo } from "@/lib/douyin-openapi"
import {
  ACCOUNT_WORK_INIT_KIND,
  TRANSCRIPT_LAZY_KIND,
  accountHistoryIdempotencyKey,
  engagementScore,
  shouldExtractTranscriptNow,
  transcriptIdempotencyKey,
  type WorkProjectionInput,
  type WorkSignalSnapshot,
} from "@/lib/aim/account-work-asset"

function accountWorkEnabled(): boolean {
  return env.AIM_ACCOUNT_WORK_INIT_ENABLED?.trim().toLowerCase() !== "false"
}

function toSignal(video: DouyinVideo): WorkSignalSnapshot | null {
  if (!video.statistics) return null
  return {
    playCount: video.statistics.playCount,
    diggCount: video.statistics.diggCount,
    commentCount: video.statistics.commentCount,
    shareCount: video.statistics.shareCount,
    collectCount: video.statistics.collectCount,
  }
}

function toProjection(input: {
  userId: string
  projectId: string
  accountId: string
  video: DouyinVideo
}): WorkProjectionInput {
  return {
    userId: input.userId,
    projectId: input.projectId,
    accountId: input.accountId,
    awemeId: input.video.itemId,
    title: input.video.title,
    publishedAt: input.video.createTime ? new Date(input.video.createTime * 1000) : null,
    coverUrl: input.video.coverUrl,
    shareUrl: input.video.shareUrl,
    signalSnapshot: toSignal(input.video),
  }
}

type AssetDelegate = {
  upsert(args: unknown): Promise<{ id: string; transcript: string | null; transcriptStatus: string }>
}

function assets(): AssetDelegate | null {
  return (prisma as unknown as { accountWorkAsset?: AssetDelegate }).accountWorkAsset ?? null
}

export async function upsertAccountWorkProjection(row: WorkProjectionInput) {
  const delegate = assets()
  if (!delegate) throw new Error("AccountWorkAsset 表尚未就绪")
  return delegate.upsert({
    where: { accountId_awemeId: { accountId: row.accountId, awemeId: row.awemeId } },
    create: {
      ...row,
      platform: row.platform ?? "douyin",
      syncedAt: new Date(),
      transcriptStatus: "pending",
    },
    update: {
      title: row.title,
      publishedAt: row.publishedAt,
      coverUrl: row.coverUrl,
      shareUrl: row.shareUrl,
      signalSnapshot: row.signalSnapshot ?? undefined,
      syncedAt: new Date(),
    },
  })
}

export async function enqueueAccountWorkInit(input: {
  userId: string
  projectId: string
  accountId: string
}) {
  if (!accountWorkEnabled()) return null
  return enqueueBackgroundTask(prisma, {
    kind: ACCOUNT_WORK_INIT_KIND,
    aggregateType: "douyin_binding",
    aggregateId: input.accountId,
    idempotencyKey: accountHistoryIdempotencyKey(input.accountId),
    maxAttempts: 3,
  })
}

export async function syncAccountWorksFromDouyin(input: {
  userId: string
  projectId: string
  accountId: string
  token: DouyinToken
  now?: Date
}) {
  const videos = await fetchDouyinRecentVideos(input.token, 500)
  const ranked = [...videos].sort((a, b) => engagementScore(toSignal(b)) - engagementScore(toSignal(a)))
  const rankById = new Map(ranked.map((video, index) => [video.itemId, index]))
  const saved = []
  for (const video of videos) {
    const row = await upsertAccountWorkProjection(toProjection({ ...input, video }))
    saved.push(row)
    const extractNow = shouldExtractTranscriptNow({
      publishedAt: video.createTime ? new Date(video.createTime * 1000) : null,
      signal: toSignal(video),
      rankAmongAll: rankById.get(video.itemId) ?? 999,
      now: input.now,
    })
    if (extractNow && !row.transcript && row.transcriptStatus !== "extracting") {
      await enqueueBackgroundTask(prisma, {
        kind: TRANSCRIPT_LAZY_KIND,
        aggregateType: "account_work_asset",
        aggregateId: row.id,
        idempotencyKey: transcriptIdempotencyKey(row.id),
        maxAttempts: 3,
      })
    }
  }
  return { videoCount: videos.length, saved: saved.length }
}

export function hashAccountHistory(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}
