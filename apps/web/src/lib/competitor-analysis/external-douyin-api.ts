import { env } from "@/env"
import type { NormalizedAccount, NormalizedComment, NormalizedVideo } from '@/lib/tikhub/types'

export interface ExternalDouyinApiResult {
  platformUserId: string
  account: NormalizedAccount
  videos: NormalizedVideo[]
  comments: NormalizedComment[]
}

interface ExternalDouyinApiEnvelope {
  data?: unknown
  platformUserId?: unknown
  account?: unknown
  videos?: unknown
  comments?: unknown
}

/**
 * @description 判断是否包含externaldouyinapi
 * @returns boolean
 */
export function hasExternalDouyinApi(): boolean {
  return Boolean(env.COMPETITOR_DOUYIN_API_URL)
}

/**
 * @description 请求获取fromexternaldouyinapi
 * @param input - 输入数据
 * @returns Promise<ExternalDouyinApiResult>
 */
export async function fetchFromExternalDouyinApi(input: {
  targetUrl: string
  platformUserId: string | null
  count: number
}): Promise<ExternalDouyinApiResult> {
  const endpoint = env.COMPETITOR_DOUYIN_API_URL
  if (!endpoint) {
    throw new Error('未配置 COMPETITOR_DOUYIN_API_URL，无法使用云端对标账号抓取')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (env.COMPETITOR_DOUYIN_API_KEY) {
    headers.Authorization = `Bearer ${env.COMPETITOR_DOUYIN_API_KEY}`
  }

  const timeoutMs = Number(env.COMPETITOR_DOUYIN_API_TIMEOUT_MS || 60000)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      platform: 'douyin',
      url: input.targetUrl,
      targetUrl: input.targetUrl,
      platformUserId: input.platformUserId,
      count: input.count,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = readString(payload, ['error', 'message']) || `${response.status} ${response.statusText}`
    throw new Error(`云端对标账号抓取失败：${message}`)
  }

  return normalizeExternalPayload(payload)
}

function normalizeExternalPayload(payload: unknown): ExternalDouyinApiResult {
  const envelope = asRecord(payload) as ExternalDouyinApiEnvelope | null
  const data = asRecord(envelope?.data) ?? asRecord(payload)
  if (!data) {
    throw new Error('云端对标账号抓取返回格式不正确：缺少 JSON 对象')
  }

  const account = normalizeAccount(data.account)
  const videos = normalizeVideos(data.videos)
  const comments = normalizeComments(data.comments)
  const platformUserId = readString(data, ['platformUserId', 'secUserId', 'sec_user_id'])
    || account.platformUserId

  if (!platformUserId) {
    throw new Error('云端对标账号抓取返回格式不正确：缺少 platformUserId')
  }
  if (videos.length === 0) {
    throw new Error('云端对标账号抓取未返回任何作品')
  }

  return {
    platformUserId,
    account: { ...account, platformUserId },
    videos,
    comments,
  }
}

function normalizeAccount(value: unknown): NormalizedAccount {
  const account = asRecord(value)
  if (!account) {
    throw new Error('云端对标账号抓取返回格式不正确：缺少 account')
  }

  const nickname = readString(account, ['nickname', 'name', 'authorNickname', 'author_nickname'])
  if (!nickname) {
    throw new Error('云端对标账号抓取返回格式不正确：缺少账号昵称')
  }

  return {
    platformUserId: readString(account, ['platformUserId', 'secUserId', 'sec_user_id', 'uid']) || '',
    nickname,
    avatar: readString(account, ['avatar', 'avatarUrl', 'avatar_url']) || '',
    signature: readString(account, ['signature', 'bio', 'description']) || '',
    followerCount: readNumber(account, ['followerCount', 'followers', 'follower_count']),
    followingCount: readNumber(account, ['followingCount', 'following', 'following_count']),
    totalLikes: readNumber(account, ['totalLikes', 'totalFavorited', 'total_favorited']),
    videoCount: readNumber(account, ['videoCount', 'awemeCount', 'aweme_count']),
    isVerified: Boolean(readBoolean(account, ['isVerified', 'verified']) || readString(account, ['verifyInfo', 'custom_verify'])),
    verifyInfo: readString(account, ['verifyInfo', 'custom_verify', 'enterprise_verify_reason']) || '',
  }
}

function normalizeVideos(value: unknown): NormalizedVideo[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const video = asRecord(item)
    if (!video) return null
    const videoId = readString(video, ['videoId', 'awemeId', 'aweme_id', 'id'])
    if (!videoId) return null
    return {
      videoId,
      title: readString(video, ['title', 'desc', 'description']) || '',
      coverUrl: readString(video, ['coverUrl', 'cover', 'cover_url']) || '',
      videoUrl: readString(video, ['videoUrl', 'playAddr', 'play_addr', 'url']) || '',
      createTime: readNumber(video, ['createTime', 'create_time', 'createdAt']),
      duration: readNumber(video, ['duration', 'durationSeconds', 'duration_seconds']),
      views: readNumber(video, ['views', 'playCount', 'play_count']),
      likes: readNumber(video, ['likes', 'diggCount', 'digg_count']),
      comments: readNumber(video, ['comments', 'commentCount', 'comment_count']),
      shares: readNumber(video, ['shares', 'shareCount', 'share_count']),
      collects: readNumber(video, ['collects', 'collectCount', 'collect_count']),
    }
  }).filter((item): item is NormalizedVideo => Boolean(item))
}

function normalizeComments(value: unknown): NormalizedComment[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const comment = asRecord(item)
    if (!comment) return null
    const commentId = readString(comment, ['commentId', 'cid', 'id'])
    if (!commentId) return null
    return {
      commentId,
      text: readString(comment, ['text', 'content']) || '',
      likes: readNumber(comment, ['likes', 'diggCount', 'digg_count']),
      createTime: readNumber(comment, ['createTime', 'create_time']),
      isTop: Boolean(readBoolean(comment, ['isTop', 'pinned']) || readNumber(comment, ['stick_position'])),
    }
  }).filter((item): item is NormalizedComment => Boolean(item))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function readNumber(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

function readBoolean(record: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
  }
  return false
}
