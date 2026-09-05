/**
 * 自有账号平台表现（方案 A：抖音 OAuth 官方 API）。
 *
 * 数据源：DouyinAccountBinding（用户自己扫码授权的号）+ fetchDouyinRecentVideos 官方数据。
 * 注入对象：数据复盘 Agent（content_retro）——与「发布结果数据」块并列的「自有账号平台表现」块。
 * 纪律：
 * - 未绑定/无有效 token → undefined（零开销，不编数据）。
 * - 拉取失败 → 显式降级文案（说明原因），不出假数。
 * - token 过期先试 refresh 并回写；refresh 失败标 expired 并提示重新授权。
 * - 只读最近 N 条（默认 20），标注「官方 API 快照，非累计核账」。
 */

import { prisma } from "@/lib/prisma"
import {
  fetchDouyinRecentVideos,
  refreshDouyinAccessToken,
  type DouyinToken,
} from "@/lib/douyin-openapi"

export interface OwnAccountVideoRow {
  title: string
  publishedAt: string | null
  views: number | null
  likes: number | null
  comments: number | null
  collects: number | null
  shares: number | null
}

export interface OwnAccountPlatformContext {
  hasData: boolean
  block: string
}

const MAX_VIDEOS = 20
const EXPIRY_GRACE_MS = 60 * 1000

function formatVideos(rows: OwnAccountVideoRow[]): string[] {
  const lines: string[] = []
  let viewsTotal: number | null = null
  const knownViews = rows.filter((row) => row.views != null)
  if (knownViews.length > 0) {
    viewsTotal = knownViews.reduce((acc, row) => acc + (row.views ?? 0), 0)
  }
  lines.push(
    `近 ${rows.length} 条作品（官方 API 快照）：` +
      (viewsTotal != null ? `播放合计 ${viewsTotal.toLocaleString("zh-CN")}` : "播放数据未返回"),
  )
  for (const row of rows.slice(0, 10)) {
    const date = row.publishedAt ?? "未知日期"
    const metrics = [
      row.views != null ? `播放 ${row.views.toLocaleString("zh-CN")}` : null,
      row.likes != null ? `赞 ${row.likes}` : null,
      row.comments != null ? `评 ${row.comments}` : null,
      row.collects != null ? `藏 ${row.collects}` : null,
      row.shares != null ? `转 ${row.shares}` : null,
    ].filter(Boolean)
    lines.push(`- [${date}] ${row.title.slice(0, 40)}｜${metrics.length ? metrics.join("｜") : "指标未返回"}`)
  }
  if (rows.length > 10) lines.push(`（其余 ${rows.length - 10} 条略）`)
  return lines
}

async function resolveValidToken(input: {
  userId: string
  binding: {
    accessToken: string
    refreshToken: string
    accessExpiresAt: Date
    openId: string
    scope?: string
  }
}): Promise<{ token: DouyinToken | null; expired: boolean }> {
  const { binding } = input
  if (binding.accessExpiresAt.getTime() - EXPIRY_GRACE_MS > Date.now()) {
    return {
      token: {
        accessToken: binding.accessToken,
        refreshToken: binding.refreshToken,
        openId: binding.openId,
        expiresIn: Math.max(0, Math.floor((binding.accessExpiresAt.getTime() - Date.now()) / 1000)),
        scope: binding.scope ?? "",
      },
      expired: false,
    }
  }
  // 过期：尝试刷新并回写；失败标 expired
  const refreshed = await refreshDouyinAccessToken(binding.refreshToken).catch(() => null)
  if (!refreshed) return { token: null, expired: true }
  const accessExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000)
  await prisma.douyinAccountBinding.update({
    where: { userId_openId: { userId: input.userId, openId: binding.openId } },
    data: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || binding.refreshToken,
      accessExpiresAt,
      syncStatus: "ok",
    },
  }).catch(() => {})
  return {
    token: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || binding.refreshToken,
      openId: binding.openId,
      expiresIn: refreshed.expiresIn,
      scope: refreshed.scope ?? binding.scope ?? "",
    },
    expired: false,
  }
}

/**
 * 读取用户自有抖音账号的最近作品表现（官方 API）。
 * 未绑定返回 { hasData:false, block 为引导文案 }；调用方按 hasData 决定是否注入。
 */
export async function loadOwnAccountPlatformContext(input: {
  userId: string
}): Promise<OwnAccountPlatformContext> {
  const binding = await prisma.douyinAccountBinding.findFirst({
    where: { userId: input.userId },
    orderBy: { updatedAt: "desc" },
  })
  if (!binding) {
    return {
      hasData: false,
      block: "自有账号平台表现：未绑定抖音账号（可在数据平台页扫码绑定自有账号，绑定后复盘可参考官方作品数据）。",
    }
  }

  const { token, expired } = await resolveValidToken({ userId: input.userId, binding })
  if (!token) {
    return {
      hasData: false,
      block: expired
        ? "自有账号平台表现：抖音授权已过期且自动续期失败，请在数据平台页重新扫码绑定后重试。"
        : "自有账号平台表现：暂无法读取抖音数据。",
    }
  }

  try {
    const videos = await fetchDouyinRecentVideos(token, MAX_VIDEOS)
    if (videos.length === 0) {
      return {
        hasData: false,
        block: "自有账号平台表现：已绑定抖音账号，但官方 API 未返回作品（账号可能无已发布作品或接口未授权视频列表权限）。",
      }
    }
    const rows: OwnAccountVideoRow[] = videos.map((video) => ({
      title: video.title,
      publishedAt: video.createTime
        ? new Date(video.createTime * 1000).toISOString().slice(0, 10)
        : null,
      views: video.statistics?.playCount ?? null,
      likes: video.statistics?.diggCount ?? null,
      comments: video.statistics?.commentCount ?? null,
      collects: video.statistics?.collectCount ?? null,
      shares: video.statistics?.shareCount ?? null,
    }))
    const lines = [
      `自有账号平台表现（数据源：抖音官方 API｜账号 ${binding.profileSnapshot && typeof binding.profileSnapshot === "object" ? String((binding.profileSnapshot as { nickname?: string }).nickname ?? binding.openId) : binding.openId}）：`,
      ...formatVideos(rows),
    ]
    return { hasData: true, block: lines.join("\n") }
  } catch (error) {
    return {
      hasData: false,
      block: `自有账号平台表现：读取抖音数据失败（${error instanceof Error ? error.message : "未知错误"}），本轮复盘不含该数据，不出估算值。`,
    }
  }
}
