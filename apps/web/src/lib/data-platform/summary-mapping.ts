/**
 * 数据看板摘要的飞书字段映射。
 *
 * 账号表/视频表存在两套字段命名：
 *  - 官方 OAuth 绑定写入的「账号*」组（账号昵称/粉丝总数/作品总数…）
 *  - 第三方采集写入的「达人*」组（达人昵称/粉丝数/达人链接…）
 * pick* 按候选顺序取第一个非空值，官方字段优先、采集字段兜底，
 * 保证两套来源都能在看板正常展示（此前「达人昵称」不在候选里，
 * 采集来的账号会显示成「未命名账号」）。
 */

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

export type LarkRecordLike = { recordId: string; fields: Record<string, unknown> }

export function pickText(fields: Record<string, unknown>, candidates: string[]): string | null {
  for (const name of candidates) {
    const v = fields[name]
    if (v == null) continue
    const s = Array.isArray(v) ? v.map((x) => String(x)).join(" ") : String(v)
    if (s.trim()) return s.trim()
  }
  return null
}

export function pickNumber(fields: Record<string, unknown>, candidates: string[]): number | null {
  for (const name of candidates) {
    const v = fields[name]
    if (v == null || v === "") continue
    const n = typeof v === "number" ? v : Number(String(v).replace(/[,，\s]/g, ""))
    if (!Number.isNaN(n) && Number.isFinite(n)) return n
  }
  return null
}

export function splitTags(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === "string") return v.split(/[,\s，、;；\/|]+/).map((x) => x.trim()).filter(Boolean)
  return null
}

/**
 * 采集来源常不写「平台」列（该列为空），但有「抖音号」即可判定为抖音账号。
 * 仅在无显式平台字段时启用，不做更激进的推断。
 */
function inferPlatform(fields: Record<string, unknown>): string {
  const explicit = pickText(fields, ["平台", "platform", "来源"])
  if (explicit) return explicit
  return pickText(fields, ["抖音号"]) ? "抖音" : "其他"
}

export function toPlatformAccount(item: LarkRecordLike): PlatformAccount {
  const fields = item.fields
  return {
    id:
      pickText(fields, ["平台账号ID", "账号ID", "open_id", "openId", "id", "达人UID", "达人加密UID"]) ||
      item.recordId,
    platform: inferPlatform(fields),
    nickname: pickText(fields, ["账号昵称", "昵称", "name", "nickname", "达人昵称"]) || "未命名账号",
    avatarUrl: pickText(fields, ["头像URL", "头像", "头像链接", "avatar", "avatarUrl"]),
    fansCount: pickNumber(fields, ["粉丝总数", "粉丝数", "fansCount", "fans", "followers"]),
    followCount: pickNumber(fields, ["关注总数", "关注数", "关注", "followCount", "follows", "following"]),
    likeCount: pickNumber(fields, [
      "获赞收藏总数",
      "获赞总数",
      "获赞",
      "点赞数",
      "likeCount",
      "likes",
      "点赞收藏",
    ]),
    workCount: pickNumber(fields, ["作品总数", "作品数", "发布数", "workCount", "works"]),
    authStatus: pickText(fields, ["账号认证状态", "认证状态", "账号认证", "authStatus"]),
    accessType: pickText(fields, ["接入方式", "接入类型", "accessType"]),
    accountStatus: pickText(fields, ["账号状态", "状态", "accountStatus"]),
    expireAt: pickText(fields, ["授权有效期至", "授权到期", "expireAt", "expiresAt"]),
    homeLink: pickText(fields, ["主页链接", "主页", "homeLink", "link", "url", "达人链接"]),
  }
}

export function toPlatformVideo(item: LarkRecordLike): PlatformVideo {
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
