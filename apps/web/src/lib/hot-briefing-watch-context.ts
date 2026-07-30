// ─── 每日热点简报：对标账号动态摘要 ─────────────────────────────
// 专为 cron 简报推送设计：无 query 门控，直接渲染该用户对标账号的最新动态快照。
// 数据来自 DB（WatchAccount.latestVideos），是上次手动刷新的快照，非实时抓取。
// 渲染风格与 aim-competitor-watch-context.ts 保持一致，但精简、标注时效。

import { prisma } from "@/lib/prisma"
import type { NormalizedVideo } from "@/lib/tikhub/types"

type WatchAccountDigest = {
  nickname: string | null
  platform: string
  targetUrl: string
  latestVideos: unknown
  viralVideos: unknown
  lastRefreshedAt: Date | string | null
}

function isVideoList(value: unknown): value is NormalizedVideo[] {
  return Array.isArray(value)
}

function formatDate(seconds: number): string {
  if (!seconds) return "时间未知"
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

function formatMetric(value: number | undefined): string {
  if (!value) return "0"
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`
  return String(value)
}

const EMPTY = "（暂无对标账号动态，请在工作台添加并刷新对标账号）"

/**
 * 构建对标账号动态摘要文本，供每日热点简报推送使用。
 * 只读 DB 快照，不触发实时抓取（规避抖音风控）。每账号最多展示 3 条最新作品。
 * 数据时效取决于上次手动刷新，摘要末尾标注"数据截至"。
 */
export async function buildWatchAccountDigest(
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return EMPTY

  const accounts = await prisma.watchAccount.findMany({
    where: { userId },
    orderBy: [{ lastRefreshedAt: "desc" }, { createdAt: "desc" }],
    take: 5,
    select: {
      nickname: true,
      platform: true,
      targetUrl: true,
      latestVideos: true,
      viralVideos: true,
      lastRefreshedAt: true,
    },
  })

  if (accounts.length === 0) return EMPTY

  const blocks = accounts.map((account: WatchAccountDigest) => {
    const videos = isVideoList(account.latestVideos) ? account.latestVideos.slice(0, 3) : []
    const rows = videos.map((video, index) => {
      const title = video.title?.trim() || "无标题作品"
      return `${index + 1}. ${title}｜${formatDate(video.createTime)}｜赞${formatMetric(video.likes)} 评${formatMetric(video.comments)} 藏${formatMetric(video.collects)} 转${formatMetric(video.shares)}`
    })

    return [
      `**${account.nickname || account.targetUrl}**（${account.platform}）`,
      rows.length > 0 ? rows.join("\n") : "暂无已刷新作品",
    ].join("\n")
  })

  // 取最近刷新时间作为整份数据的时效标注
  const latestRefresh = accounts
    .map((a) => (a.lastRefreshedAt ? new Date(a.lastRefreshedAt).getTime() : 0))
    .sort((a, b) => b - a)[0]
  const asOf = latestRefresh ? new Date(latestRefresh).toISOString().slice(0, 10) : "未知"

  return `**对标账号动态**（数据截至 ${asOf}，非实时）\n${blocks.join("\n\n")}`
}
