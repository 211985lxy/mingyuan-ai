import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  fetchDouyinRecentVideos,
  refreshDouyinAccessToken,
  type DouyinToken,
} from "@/lib/douyin-openapi"
import {
  runAccountWorksSync,
  type AccountWorksSyncStorePort,
  type AccountWorksSyncSummary,
  type SyncedWorkItem,
} from "@/lib/aim/account-works-sync"
import { readWorkStats } from "@/lib/aim/account-work-assets"

const EXPIRY_GRACE_MS = 60 * 1000
const VIDEO_FETCH_MAX = 50

// 与 outcome-autofetch-store 同一套令牌解析（刷新落库 + 宽限判断）。
async function resolveBindingToken(binding: {
  userId: string
  openId: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: Date
  scope: string
}): Promise<DouyinToken | null> {
  if (binding.accessExpiresAt.getTime() - EXPIRY_GRACE_MS > Date.now()) {
    return {
      accessToken: binding.accessToken,
      refreshToken: binding.refreshToken,
      openId: binding.openId,
      expiresIn: Math.max(0, Math.floor((binding.accessExpiresAt.getTime() - Date.now()) / 1000)),
      scope: binding.scope,
    }
  }
  const refreshed = await refreshDouyinAccessToken(binding.refreshToken).catch(() => null)
  if (!refreshed) return null
  await prisma.douyinAccountBinding.update({
    where: { userId_openId: { userId: binding.userId, openId: binding.openId } },
    data: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || binding.refreshToken,
      accessExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      syncStatus: "ok",
    },
  }).catch(() => undefined)
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || binding.refreshToken,
    openId: binding.openId,
    expiresIn: refreshed.expiresIn,
    scope: refreshed.scope || binding.scope,
  }
}

async function fetchWorks(binding: { id: string; userId: string }): Promise<SyncedWorkItem[]> {
  const row = await prisma.douyinAccountBinding.findFirst({
    where: { id: binding.id, userId: binding.userId },
  })
  if (!row) throw Object.assign(new Error("绑定不存在"), { code: "missing" })
  const token = await resolveBindingToken(row)
  if (!token) throw Object.assign(new Error("token expired"), { code: "expired" })
  const videos = await fetchDouyinRecentVideos(token, VIDEO_FETCH_MAX)
  return videos.map((video) => ({
    externalWorkId: video.itemId,
    title: video.title,
    coverUrl: video.coverUrl ?? null,
    publishedAt:
      typeof video.createTime === "number" && video.createTime > 0
        ? new Date(video.createTime * 1000).toISOString()
        : null,
    stats: {
      views: video.statistics?.playCount ?? 0,
      likes: video.statistics?.diggCount ?? 0,
      comments: video.statistics?.commentCount ?? 0,
      saves: video.statistics?.collectCount ?? 0,
      shares: video.statistics?.shareCount ?? 0,
    },
  }))
}

export function createPrismaAccountWorksSyncStore(): AccountWorksSyncStorePort {
  return {
    listBindings: async () => {
      const rows = await prisma.douyinAccountBinding.findMany({
        select: { id: true, userId: true },
        orderBy: { createdAt: "asc" },
        take: 100,
      })
      // 项目归属以账号绑定为准（row-ownership：一个 AIM 账号绑定一个 IP 项目）。
      const projectByUser = new Map<string, string | null>()
      for (const binding of rows) {
        if (projectByUser.has(binding.userId)) continue
        const user = await prisma.user.findUnique({
          where: { id: binding.userId },
          select: { boundProjectId: true },
        })
        projectByUser.set(binding.userId, user?.boundProjectId ?? null)
      }
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        projectId: projectByUser.get(row.userId) ?? null,
      }))
    },
    fetchWorks,
    loadExisting: async (bindingId) => {
      const rows = await prisma.accountWorkAsset.findMany({
        where: { bindingId },
        select: {
          externalWorkId: true,
          title: true,
          coverUrl: true,
          publishedAt: true,
          stats: true,
          transcript: true,
          transcriptStatus: true,
          transcriptAttempts: true,
        },
        take: 500,
      })
      return rows.map((row) => ({
        externalWorkId: row.externalWorkId,
        title: row.title,
        coverUrl: row.coverUrl,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        stats: readWorkStats(row.stats),
        transcript: row.transcript,
        transcriptStatus: (row.transcriptStatus as "none" | "pending" | "ready" | "failed") ?? "none",
        transcriptAttempts: row.transcriptAttempts,
      }))
    },
    saveMerged: async ({ bindingId, userId, projectId, works }) => {
      let upserted = 0
      for (const work of works) {
        await prisma.accountWorkAsset.upsert({
          where: { bindingId_externalWorkId: { bindingId, externalWorkId: work.externalWorkId } },
          create: {
            bindingId,
            projectId,
            platform: "douyin",
            externalWorkId: work.externalWorkId,
            title: work.title,
            coverUrl: work.coverUrl,
            publishedAt: work.publishedAt ? new Date(work.publishedAt) : null,
            stats: work.stats as unknown as Prisma.InputJsonValue,
            transcript: work.transcript,
            transcriptStatus: work.transcriptStatus,
            transcriptAttempts: work.transcriptAttempts,
            lastSyncedAt: new Date(),
          },
          update: {
            projectId,
            title: work.title,
            coverUrl: work.coverUrl,
            publishedAt: work.publishedAt ? new Date(work.publishedAt) : null,
            stats: work.stats as unknown as Prisma.InputJsonValue,
            lastSyncedAt: new Date(),
          },
        })
        upserted += 1
      }
      return { upserted }
    },
  }
}

export async function runAccountWorksSyncWithPrisma(options: {
  bindingId?: string
} = {}): Promise<AccountWorksSyncSummary> {
  return runAccountWorksSync(createPrismaAccountWorksSyncStore(), options)
}
