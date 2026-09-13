import { prisma } from "@/lib/prisma"
import { upsertOperationalAlert } from "@/lib/operational-alerts"
import { fetchAccountWorks } from "@/lib/aim/account-works-source"
import { readWorkStats } from "@/lib/aim/account-work-assets"
import {
  runOutcomeAutofetch,
  type OutcomeAutofetchStore,
  type OutcomeAutofetchSummary,
} from "@/lib/aim/outcome-autofetch"

const VIDEO_FETCH_MAX = 50

/**
 * 取该绑定账号的作品列表（WP-1.1 数据源）。
 *
 * 抖音开放平台的「授权账号作品列表」能力已下线（实测 28001056），故与 WP-A1 共用
 * 同一套第三方公开数据通道（TikHub 主 / 红狐备）。通道全部失败时抛错，不返回空数组
 * ——否则"API 挂了但 cron 报成功"的假绿会重演。
 *
 * 播放量口径：抖音不对外公开播放量（第三方通道 play_count 恒为 0），因此**不写 0**
 * （0 是假事实），留 undefined 由下游写 null 表示"未知"，避免报表与预测把 0 当真实值。
 */
/**
 * 归一化作品 → 回流所需的视频行（纯函数，便于单测）。
 * 播放量口径：抖音不对外公开播放量，play_count 恒为 0；此处**不写 0**（0 是假事实），
 * 留 undefined 由下游写 null 表示"未知"，避免报表与预测把 0 当真实值。
 */
export function toAutofetchVideoRows(
  items: Array<{ externalWorkId: string; stats: Record<string, unknown> }>,
) {
  return items.map((item) => {
    const stats = readWorkStats(item.stats)
    const plays = typeof stats.views === "number" && stats.views > 0 ? stats.views : undefined
    return {
      itemId: item.externalWorkId,
      videoId: item.externalWorkId,
      shareUrl: null,
      statistics: {
        playCount: plays,
        diggCount: stats.likes,
        commentCount: stats.comments,
        collectCount: stats.saves,
        shareCount: stats.shares,
      },
    }
  })
}

async function fetchVideosForBinding(binding: { id: string; userId: string }) {
  const row = await prisma.douyinAccountBinding.findFirst({
    where: { id: binding.id, userId: binding.userId },
    select: { id: true, secUserId: true, profileUrl: true },
  })
  if (!row) throw new Error("绑定不存在")
  try {
    const { items } = await fetchAccountWorks({
      secUserId: row.secUserId,
      profileUrl: row.profileUrl,
      count: VIDEO_FETCH_MAX,
    })
    return toAutofetchVideoRows(items)
  } catch (error) {
    // 失败不静默：落一条带处置建议的告警，运维/用户能一眼知道下一步做什么。
    const missingLink = !row.secUserId || !row.profileUrl
    await upsertOperationalAlert({
      fingerprint: `outcome-autofetch-works:${binding.id}`,
      rule: "outcome_autofetch_works_channel",
      severity: "warning",
      summary: missingLink
        ? `抖音绑定 ${binding.id} 缺主页链接，作品数据无法取数（抖音官方作品列表能力已下线）；请在账号设置 → 抖音绑定处「补充主页链接」`
        : `抖音绑定 ${binding.id} 作品数据取数失败：${error instanceof Error ? error.message : "未知错误"}`,
      source: "outcome-autofetch",
    }).catch(() => undefined)
    throw error
  }
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
