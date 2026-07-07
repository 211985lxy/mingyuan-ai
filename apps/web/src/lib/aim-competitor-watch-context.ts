import { prisma } from "@/lib/prisma"
import type { NormalizedVideo } from "@/lib/tikhub/types"

type WatchAccountForAim = {
  nickname: string | null
  platform: string
  targetUrl: string
  latestVideos: unknown
  lastRefreshedAt: Date | string | null
  refreshStatus: string
}

function requestedVideoCount(query: string): number {
  const match = query.match(/(?:最近|近期)?\s*(\d{1,2})\s*条?作品/)
  const count = match ? Number(match[1]) : 12
  return Math.min(Math.max(count || 12, 1), 20)
}

function wantsWatchAccountContext(query: string): boolean {
  return /(对标|竞品|监控).*(账号|作品|视频|内容|特点|发了什么)|近期.*作品|最近.*作品/.test(query)
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

export function formatWatchAccountsForAim(query: string, accounts: WatchAccountForAim[]): string {
  if (!wantsWatchAccountContext(query) || accounts.length === 0) return ""

  const count = requestedVideoCount(query)
  const matched = accounts.filter((account) => {
    const name = account.nickname?.trim()
    return name ? query.includes(name) || name.includes(query.trim()) : false
  })
  const selected = matched.length > 0 ? matched : accounts.slice(0, 3)

  const blocks = selected.map((account) => {
    const videos = isVideoList(account.latestVideos) ? account.latestVideos.slice(0, count) : []
    const rows = videos.map((video, index) => {
      const title = video.title?.trim() || "无标题作品"
      return `${index + 1}. ${title}｜${formatDate(video.createTime)}｜赞${formatMetric(video.likes)} 评${formatMetric(video.comments)} 藏${formatMetric(video.collects)} 转${formatMetric(video.shares)}`
    })

    return [
      `账号：${account.nickname || account.targetUrl}（${account.platform}）`,
      `刷新状态：${account.refreshStatus}${account.lastRefreshedAt ? `，最近刷新：${new Date(account.lastRefreshedAt).toISOString().slice(0, 10)}` : ""}`,
      rows.length > 0 ? `近期作品（最多 ${count} 条）：\n${rows.join("\n")}` : "近期作品：暂无已刷新作品数据",
    ].join("\n")
  })

  return `【对标账号监控数据】\n${blocks.join("\n\n")}\n\n回答要求：用户问近期作品时，直接基于上述作品列表回答；可以归纳内容特点，但要说明这是最近一次刷新缓存，不要说成实时抓取结果。`
}

export async function buildAimCompetitorWatchContext(userId: string, query: string): Promise<string> {
  if (!wantsWatchAccountContext(query)) return ""

  const accounts = await prisma.watchAccount.findMany({
    where: { userId },
    orderBy: [{ lastRefreshedAt: "desc" }, { createdAt: "desc" }],
    take: 10,
    select: {
      nickname: true,
      platform: true,
      targetUrl: true,
      latestVideos: true,
      lastRefreshedAt: true,
      refreshStatus: true,
    },
  })

  return formatWatchAccountsForAim(query, accounts)
}
