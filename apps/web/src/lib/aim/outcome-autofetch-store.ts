import { prisma } from "@/lib/prisma"
import { upsertOperationalAlert } from "@/lib/operational-alerts"
import {
  fetchDouyinRecentVideos,
  refreshDouyinAccessToken,
  type DouyinToken,
} from "@/lib/douyin-openapi"
import {
  runOutcomeAutofetch,
  type OutcomeAutofetchStore,
  type OutcomeAutofetchSummary,
} from "@/lib/aim/outcome-autofetch"

const EXPIRY_GRACE_MS = 60 * 1000
const VIDEO_FETCH_MAX = 50

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

async function fetchVideosForBinding(binding: { id: string; userId: string }) {
  const row = await prisma.douyinAccountBinding.findFirst({
    where: { id: binding.id, userId: binding.userId },
  })
  if (!row) throw Object.assign(new Error("token expired"), { code: "expired" })
  const token = await resolveBindingToken(row)
  if (!token) throw Object.assign(new Error("token expired"), { code: "expired" })
  const videos = await fetchDouyinRecentVideos(token, VIDEO_FETCH_MAX)
  return videos.map((video) => ({
    itemId: video.itemId,
    videoId: video.videoId ?? null,
    shareUrl: video.shareUrl ?? null,
    statistics: video.statistics
      ? {
          playCount: video.statistics.playCount,
          diggCount: video.statistics.diggCount,
          commentCount: video.statistics.commentCount,
          collectCount: video.statistics.collectCount,
          shareCount: video.statistics.shareCount,
        }
      : null,
  }))
}

async function upsertContentSignals(input: Parameters<OutcomeAutofetchStore["upsertContentSignals"]>[0]) {
  await prisma.contentOutcome.upsert({
    where: {
      userId_generationId_collectWindowDay: {
        userId: input.userId,
        generationId: input.generationId,
        collectWindowDay: input.collectWindowDay,
      },
    },
    create: {
      userId: input.userId,
      generationId: input.generationId,
      projectId: input.projectId,
      topicSelectionId: input.topicSelectionId,
      collectWindowDay: input.collectWindowDay,
      platform: input.platform,
      publishedAt: input.publishedAt,
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      saves: input.saves,
      shares: input.shares,
    },
    update: {
      platform: input.platform,
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      saves: input.saves,
      shares: input.shares,
      collectedAt: new Date(),
    },
  })
}

export function createPrismaOutcomeAutofetchStore(): OutcomeAutofetchStore {
  return {
    listPublishedGenerations: async () => prisma.aimGeneration.findMany({
      where: { workflowStatus: "published", publishedAt: { not: null } },
      select: {
        id: true,
        userId: true,
        projectId: true,
        topicSelectionId: true,
        publishPlatform: true,
        publishUrl: true,
        publishedAt: true,
      },
      take: 2000,
    }),
    listBindings: async (userId) => prisma.douyinAccountBinding.findMany({
      where: { userId },
      select: { id: true, userId: true, openId: true },
      take: 20,
    }),
    fetchVideosForBinding,
    upsertContentSignals,
    markBindingExpired: async (binding) => {
      await prisma.douyinAccountBinding.update({
        where: { id: binding.id },
        data: { syncStatus: "expired" },
      }).catch(() => undefined)
    },
    alert: async (input) => {
      await upsertOperationalAlert({
        fingerprint: input.fingerprint,
        rule: "outcome_autofetch_token",
        severity: "warning",
        summary: input.summary,
        source: "outcome-autofetch",
      }).catch(() => undefined)
    },
    getBoundProjectId: async (userId) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { boundProjectId: true },
      })
      return user?.boundProjectId ?? null
    },
  }
}

export async function runPrismaOutcomeAutofetch(now = new Date()): Promise<OutcomeAutofetchSummary> {
  return runOutcomeAutofetch({ store: createPrismaOutcomeAutofetchStore(), now })
}
