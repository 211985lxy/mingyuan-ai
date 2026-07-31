import { NextRequest, NextResponse } from "next/server"

import { env } from "@/env"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { listLarkBaseRecords } from "@/lib/lark-base"

export type PlatformAccount = {
  id: string
  platform: string
  nickname: string
  avatarUrl?: string | null
  fansCount?: number | null
  followCount?: number | null
  likeCount?: number | null
  workCount?: number | null
  authStatus?: string | null
  accessType?: string | null
  accountStatus?: string | null
  expireAt?: string | null
  homeLink?: string | null
}

export type PlatformVideo = {
  id: string
  platform: string
  title: string
  coverUrl?: string | null
  publishedAt?: string | null
  playCount?: number | null
  likeCount?: number | null
  commentCount?: number | null
  favoriteCount?: number | null
  shareCount?: number | null
  completionRate?: number | null
  tags?: string[] | null
  aimSuggestion?: string | null
  trafficSource?: string | null
}

export type PlatformSummaryResponse =
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string; error?: unknown }
  | {
      status: "ok"
      accounts: PlatformAccount[]
      recentVideos: PlatformVideo[]
      fetchedAt: string
    }

function pickText(fields: Record<string, unknown>, candidates: string[]): string | null {
  for (const name of candidates) {
    const v = fields[name]
    if (v == null) continue
    const s = Array.isArray(v) ? v.map((x) => String(x)).join(" ") : String(v)
    if (s.trim()) return s.trim()
  }
  return null
}

function pickNumber(fields: Record<string, unknown>, candidates: string[]): number | null {
  for (const name of candidates) {
    const v = fields[name]
    if (v == null || v === "") continue
    const n = typeof v === "number" ? v : Number(String(v).replace(/[,，\s]/g, ""))
    if (!Number.isNaN(n) && Number.isFinite(n)) return n
  }
  return null
}

function splitTags(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === "string") return v.split(/[,\s，、;；\/|]+/).map((x) => x.trim()).filter(Boolean)
  return null
}

function toPlatformAccount(item: { recordId: string; fields: Record<string, unknown> }): PlatformAccount {
  const fields = item.fields
  return {
    id: pickText(fields, ["平台账号ID", "账号ID", "open_id", "openId", "id"]) || item.recordId,
    platform: pickText(fields, ["平台", "platform", "来源"]) || "其他",
    nickname: pickText(fields, ["账号昵称", "昵称", "name", "nickname"]) || "未命名账号",
    avatarUrl: pickText(fields, ["头像URL", "头像", "头像链接", "avatar", "avatarUrl"]),
    fansCount: pickNumber(fields, ["粉丝总数", "粉丝数", "fansCount", "fans", "followers"]),
    followCount: pickNumber(fields, ["关注总数", "关注数", "followCount", "follows", "following"]),
    likeCount: pickNumber(fields, [
      "获赞收藏总数",
      "获赞总数",
      "点赞数",
      "likeCount",
      "likes",
      "点赞收藏",
    ]),
    workCount: pickNumber(fields, ["作品总数", "作品数", "发布数", "workCount", "works"]),
    authStatus: pickText(fields, ["账号认证状态", "认证状态", "authStatus"]),
    accessType: pickText(fields, ["接入方式", "接入类型", "accessType"]),
    accountStatus: pickText(fields, ["账号状态", "状态", "accountStatus"]),
    expireAt: pickText(fields, ["授权有效期至", "授权到期", "expireAt", "expiresAt"]),
    homeLink: pickText(fields, ["主页链接", "主页", "homeLink", "link", "url"]),
  }
}

function toPlatformVideo(item: { recordId: string; fields: Record<string, unknown> }): PlatformVideo {
  const fields = item.fields
  return {
    id: pickText(fields, ["视频ID", "笔记ID", "作品ID", "id"]) || item.recordId,
    platform: pickText(fields, ["平台", "platform", "来源"]) || "抖音",
    title: pickText(fields, ["标题", "title", "name"]) || "未命名作品",
    coverUrl: pickText(fields, ["封面URL", "封面", "coverUrl", "cover", "封面图"]),
    publishedAt: pickText(fields, ["发布时间", "发布日期", "publishedAt", "publishTime", "pub_time"]),
    playCount: pickNumber(fields, ["播放量", "播放数", "playCount", "views", "play"]),
    likeCount: pickNumber(fields, ["点赞数", "点赞量", "likeCount", "likes"]),
    commentCount: pickNumber(fields, ["评论数", "评论量", "commentCount", "comments"]),
    favoriteCount: pickNumber(fields, ["收藏数", "收藏量", "favoriteCount", "favorites", "收藏"]),
    shareCount: pickNumber(fields, ["转发数", "分享数", "shareCount", "shares", "转发"]),
    completionRate: pickNumber(fields, ["完播率", "completionRate", "completion"]),
    tags: splitTags(fields["话题标签"] ?? fields["标签"] ?? fields["tags"] ?? fields["话题"]),
    aimSuggestion: pickText(fields, ["智能体建议", "AI建议", "aimSuggestion", "建议"]),
    trafficSource: pickText(fields, ["流量来源", "流量构成", "trafficSource", "source"]),
  }
}

export const runtime = "nodejs"

function buildNotConfiguredResponse() {
  const response: PlatformSummaryResponse = {
    status: "not_configured",
    message:
      "未配置多平台数据仓库的飞书 Base。请在环境变量中设置 LARK_PLATFORM_DATA_BASE_TOKEN 以及至少一个表 ID（LARK_PLATFORM_ACCOUNT_TABLE_ID / LARK_PLATFORM_VIDEO_TABLE_ID）。",
  }
  return NextResponse.json(response as unknown)
}

function buildLarkFetchTasks(baseToken: string, accountTableId?: string, videoTableId?: string) {
  const t: Array<Promise<PlatformAccount[] | PlatformVideo[]>> = []
  if (accountTableId) {
    t.push(listLarkBaseRecords({ baseToken, tableId: accountTableId, limit: 20, offset: 0, identity: "bot" })
      .then((rows) => rows.map(toPlatformAccount))
      .catch((err) => { console.error("[data-platform] 账号表读取失败:", err?.message || err); return [] as PlatformAccount[] }),
    )
  } else { t.push(Promise.resolve([] as PlatformAccount[])) }
  if (videoTableId) {
    t.push(listLarkBaseRecords({ baseToken, tableId: videoTableId, limit: 20, offset: 0, identity: "bot" })
      .then((rows) => rows.map(toPlatformVideo))
      .catch((err) => { console.error("[data-platform] 视频表读取失败:", err?.message || err); return [] as PlatformVideo[] }),
    )
  } else { t.push(Promise.resolve([] as PlatformVideo[])) }
  return t
}

function buildSummaryResponse(accounts: PlatformAccount[], recentVideos: PlatformVideo[]) {
  const sorted = [...recentVideos].sort((a, b) => {
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return bt - at
  })
  const response: PlatformSummaryResponse = { status: "ok", accounts, recentVideos: sorted, fetchedAt: new Date().toISOString() }
  return NextResponse.json(response as unknown)
}

function buildPlatformErrorResponse(err: unknown) {
  const response: PlatformSummaryResponse = {
    status: "error",
    message: err instanceof Error ? err.message : "读取飞书数据仓库失败",
    error: err instanceof Error ? { name: err.name, message: err.message } : err,
  }
  return NextResponse.json(response as unknown, { status: 500 })
}

/**
 * 多平台数据看板摘要：账号总览 + 近期作品数据
 * 如果未配置 LARK_PLATFORM_DATA_BASE_TOKEN，返回 not_configured，前端显示空态引导。
 */
export async function GET(request: NextRequest) {
  try { await authenticateRequest(request) } catch (err) { return authErrorResponse(err) }

  const baseToken = env.LARK_PLATFORM_DATA_BASE_TOKEN?.trim()
  const accountTableId = env.LARK_PLATFORM_ACCOUNT_TABLE_ID?.trim()
  const videoTableId = env.LARK_PLATFORM_VIDEO_TABLE_ID?.trim()
  if (!baseToken || (!accountTableId && !videoTableId)) return buildNotConfiguredResponse()

  try {
    const tasks = buildLarkFetchTasks(baseToken, accountTableId, videoTableId)
    const [accounts, recentVideos] = (await Promise.all(tasks)) as [PlatformAccount[], PlatformVideo[]]
    return buildSummaryResponse(accounts, recentVideos)
  } catch (err) { return buildPlatformErrorResponse(err) }
}
