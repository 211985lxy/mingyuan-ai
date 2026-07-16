import { env } from "@/env"
import type { NormalizedAccount, NormalizedComment, NormalizedVideo } from '@/lib/tikhub/types'

export interface RedFoxDouyinApiResult {
  platformUserId: string
  account: NormalizedAccount
  videos: NormalizedVideo[]
  comments: NormalizedComment[]
}

interface RedFoxEnvelope<T> {
  code?: number
  msg?: string
  data?: T
}

interface RedFoxUser {
  nickname?: string
  avatarUrl?: string
  signature?: string
  displayId?: string
  uid?: string
  followerCount?: number
  awemeCount?: number
  totalFavorited?: number | string
}

interface RedFoxWork {
  workId?: string
  title?: string
  content?: string
  workUrl?: string
  coverUrl?: string
  duration?: number
  publishTime?: string
  repostCount?: number
  commentCount?: number
  shareCount?: number
  likeCount?: number
  collectCount?: number
  authorId?: string
  secUid?: string
  accountName?: string
  avatarUrl?: string
  followerCount?: number
}

interface RedFoxWorkList {
  total?: number
  hasMore?: boolean | number
  list?: RedFoxWork[]
}

const REDFOX_BASE = env.REDFOX_BASE_URL || 'https://redfox.hk'
const TIMEOUT_MS = Number(env.REDFOX_TIMEOUT_MS || 60000)
const PAGE_SIZE = 20

export function hasRedFoxDouyinApi(): boolean {
  return Boolean(env.REDFOX_API_KEY)
}

export async function fetchFromRedFoxDouyinApi(input: {
  targetUrl: string
  platformUserId: string | null
  count: number
}): Promise<RedFoxDouyinApiResult> {
  const count = Math.max(1, input.count)
  const videos = await fetchWorkList(input, count)
  if (videos.items.length === 0) {
    throw new Error('RedFox 对标账号抓取未返回任何作品')
  }

  const first = videos.raw[0]
  const user = await fetchUser(first.authorId || input.platformUserId || extractUserPathId(input.targetUrl))
    .catch(() => null)
  const platformUserId = first.secUid || user?.uid || input.platformUserId || first.authorId || ''

  if (!platformUserId) {
    throw new Error('RedFox 对标账号抓取返回格式不正确：缺少 platformUserId')
  }

  return {
    platformUserId,
    account: normalizeAccount(user, first, platformUserId, videos.items.length),
    videos: videos.items,
    comments: [],
  }
}

export async function resolveRedFoxDouyinAccountId(input: {
  targetUrl: string
  platformUserId: string | null
}): Promise<string> {
  if (input.platformUserId && !isSecUserId(input.platformUserId)) {
    return input.platformUserId
  }

  const data = await redfoxPost<RedFoxWorkList>(
    '/story/api/dyData/queryWorkList',
    buildWorkListBody(input, 0),
  )
  const first = Array.isArray(data.list) ? data.list[0] : undefined
  const accountId = first?.authorId

  if (!accountId) {
    throw new Error('未找到账号信息，请检查主页链接是否可访问，或先打开抖音主页确认该账号有公开作品')
  }

  return accountId
}

async function fetchWorkList(
  input: { targetUrl: string; platformUserId: string | null },
  count: number,
): Promise<{ items: NormalizedVideo[]; raw: RedFoxWork[] }> {
  const raw: RedFoxWork[] = []
  let offset = 0

  while (raw.length < count) {
    const data = await redfoxPost<RedFoxWorkList>(
      '/story/api/dyData/queryWorkList',
      buildWorkListBody(input, offset),
    )

    const list = Array.isArray(data.list) ? data.list : []
    raw.push(...list)
    if (!data.hasMore || list.length === 0) break
    offset += PAGE_SIZE
  }

  return {
    raw: raw.slice(0, count),
    items: raw.slice(0, count).map(normalizeVideo).filter((v): v is NormalizedVideo => Boolean(v)),
  }
}

function buildWorkListBody(
  input: { targetUrl: string; platformUserId: string | null },
  offset: number,
): Record<string, unknown> {
  const userPathId = extractUserPathId(input.targetUrl)
  const userId = input.platformUserId || userPathId
  const body: Record<string, unknown> = {
    authorUrl: input.targetUrl,
    offset,
    sortType: '_2',
  }

  if (userId) {
    if (isSecUserId(userId)) {
      body.secUserId = userId
    } else {
      body.accountId = userId
    }
  }

  return body
}

async function fetchUser(accountId: string | null): Promise<RedFoxUser | null> {
  if (!accountId) return null
  return redfoxPost<RedFoxUser>('/story/api/dyData/queryUser', { accountId })
}

async function redfoxPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = env.REDFOX_API_KEY
  if (!apiKey) throw new Error('REDFOX_API_KEY environment variable is not set')

  const res = await fetch(`${REDFOX_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      REDFOX_API_KEY: apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const json = await res.json().catch(() => null) as RedFoxEnvelope<T> | null
  if (!res.ok) {
    throw new Error(`RedFox ${path} failed: HTTP ${res.status} ${res.statusText}`)
  }
  if (!json || json.code !== 2000 || json.data === undefined) {
    throw new Error(`RedFox ${path} returned error: ${json?.msg || '响应异常'}`)
  }
  return json.data
}

function normalizeAccount(
  user: RedFoxUser | null,
  fallback: RedFoxWork | undefined,
  platformUserId: string,
  videoCount: number,
): NormalizedAccount {
  return {
    platformUserId,
    nickname: user?.nickname || fallback?.accountName || '',
    avatar: user?.avatarUrl || fallback?.avatarUrl || '',
    signature: user?.signature || '',
    followerCount: numberValue(user?.followerCount ?? fallback?.followerCount),
    followingCount: 0,
    totalLikes: numberValue(user?.totalFavorited),
    videoCount: numberValue(user?.awemeCount) || videoCount,
    isVerified: false,
    verifyInfo: '',
  }
}

function normalizeVideo(item: RedFoxWork): NormalizedVideo | null {
  if (!item.workId) return null
  return {
    videoId: item.workId,
    title: item.title || firstLine(item.content) || '',
    coverUrl: item.coverUrl || '',
    videoUrl: item.workUrl || '',
    createTime: parsePublishTime(item.publishTime),
    duration: numberValue(item.duration),
    views: 0,
    likes: numberValue(item.likeCount),
    comments: numberValue(item.commentCount),
    shares: numberValue(item.shareCount ?? item.repostCount),
    collects: numberValue(item.collectCount),
  }
}

function extractUserPathId(url: string): string | null {
  try {
    return new URL(url).pathname.match(/\/user\/([^/?#]+)/)?.[1] ?? null
  } catch {
    return null
  }
}

function isSecUserId(value: string): boolean {
  return value.startsWith('MS4w')
}

function firstLine(value: string | undefined): string {
  return value?.split(/\r?\n/, 1)[0]?.slice(0, 80) ?? ''
}

function parsePublishTime(value: string | undefined): number {
  if (!value) return 0
  const time = Date.parse(value.replace(' ', 'T'))
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}
