import { redfoxPost, hasRedFoxApiKey } from '@/lib/redfox/client'

export interface SimilarAccountVideo {
  title: string
  coverUrl: string
  videoUrl: string
  createTime: string
  likes: number
  comments: number
  shares: number
  views: number
  interactiveCount: number
}

export interface SimilarAccount {
  nickname: string
  avatar: string
  targetUrl: string
  platformUserId: string
  followerCount: number
  redfoxScore: number | null
  reason: string
  recentVideos: SimilarAccountVideo[]
}

export interface SimilarAccountDiscovery {
  currentAccount: SimilarAccount | null
  peerAccounts: SimilarAccount[]
  leaderAccounts: SimilarAccount[]
}

// ── 抖音 RedFox 响应类型 ──

interface RedFoxDouyinSimilarResponse {
  currentAccount?: RedFoxDouyinAccount
  benchmarkAccounts?: RedFoxDouyinAccount[]
  topAccounts?: RedFoxDouyinAccount[]
}

interface RedFoxDouyinAccount {
  nickname?: string
  avatarUrl?: string
  url?: string
  accountId?: string
  uid?: string
  secUid?: string
  followerCount?: number
  redfoxIndex?: number
  reason?: string
  recommendReason?: string
  works?: RedFoxDouyinWork[]
}

interface RedFoxDouyinWork {
  title?: string
  desc?: string
  coverUrl?: string
  workUrl?: string
  createTime?: string
  diggCount?: number
  commentCount?: number
  shareCount?: number
  playCount?: number
  interactiveCount?: number
}

// ── 小红书 RedFox 响应类型 ──

interface RedFoxXhsSimilarResponse {
  sameLevel?: RedFoxXhsAccount[]
  highLevel?: RedFoxXhsAccount[]
}

interface RedFoxXhsAccount {
  nickname?: string
  avatar?: string
  url?: string
  redId?: string
  track?: string
  fansCount?: number
  noteCount?: number
  redfoxIndex?: number
  level?: string
  reason?: string
  recommendReason?: string
  notes?: RedFoxXhsNote[]
}

interface RedFoxXhsNote {
  title?: string
  desc?: string
  cover?: string
  noteUrl?: string
  createTime?: string
  likeCount?: number
  commentCount?: number
  shareCount?: number
  collectCount?: number
}

// ── 公共方法 ──

/**
 * @description 判断是否包含redfoxsimilaraccountsapi
 * @returns boolean
 */
export function hasRedFoxSimilarAccountsApi(): boolean {
  return hasRedFoxApiKey()
}

/**
 * 发现相似账号（抖音版）。
 * 基于 accountId 查询，返回同阶对标(benchmarkAccounts) + 头部标杆(topAccounts)。
 */
/**
 * @description discoverdouyinsimilaraccounts
 * @param input - 输入数据
 * @returns Promise<SimilarAccountDiscovery>
 */
export async function discoverDouyinSimilarAccounts(input: {
  accountId: string
}): Promise<SimilarAccountDiscovery> {
  const accountId = input.accountId.trim()
  if (!accountId) throw new Error('请输入抖音主页链接')

  const data = await redfoxPost<RedFoxDouyinSimilarResponse>(
    '/story/api/dyUser/querySimilarAccounts',
    {
      accountId,
      source: 'aim',
    },
  )

  return {
    currentAccount: normalizeDouyinAccount(data.currentAccount),
    peerAccounts: normalizeDouyinAccounts(data.benchmarkAccounts),
    leaderAccounts: normalizeDouyinAccounts(data.topAccounts),
  }
}

/**
 * 发现相似账号（小红书版）。
 * 支持 redId 精确查询，或 track/fans/level 组合筛选。
 * 返回同阶对标(sameLevel) + 高阶标杆(highLevel)。
 */
/**
 * @description discoverxhssimilaraccounts
 * @param input - 输入数据
 * @returns Promise<SimilarAccountDiscovery>
 */
export async function discoverXhsSimilarAccounts(input: {
  redId?: string
  track?: string
  minFans?: number
  maxFans?: number
  level?: string
}): Promise<SimilarAccountDiscovery> {
  const { redId, track, minFans, maxFans, level } = input

  if (!redId && !track) {
    throw new Error('请输入小红书主页链接或选择内容赛道')
  }

  const body: Record<string, unknown> = { source: 'aim' }
  if (redId) body.redId = redId
  if (track) body.track = track
  if (minFans !== undefined) body.minFans = minFans
  if (maxFans !== undefined) body.maxFans = maxFans
  if (level) body.level = level

  const data = await redfoxPost<RedFoxXhsSimilarResponse>(
    '/story/api/xhsUser/querySimilarAccounts',
    body,
  )

  return {
    currentAccount: null,
    peerAccounts: normalizeXhsAccounts(data.sameLevel),
    leaderAccounts: normalizeXhsAccounts(data.highLevel),
  }
}

// ── 抖音归一化 ──

function normalizeDouyinAccounts(accounts: RedFoxDouyinAccount[] | undefined): SimilarAccount[] {
  return Array.isArray(accounts)
    ? accounts.map(normalizeDouyinAccount).filter((a): a is SimilarAccount => Boolean(a))
    : []
}

function normalizeDouyinAccount(account: RedFoxDouyinAccount | undefined): SimilarAccount | null {
  if (!account) return null
  const platformUserId = account.secUid || account.uid || account.accountId || ''
  const targetUrl = account.url || (platformUserId ? `https://www.douyin.com/user/${platformUserId}` : '')

  return {
    nickname: account.nickname || '',
    avatar: account.avatarUrl || '',
    targetUrl,
    platformUserId,
    followerCount: numberValue(account.followerCount),
    redfoxScore: nullableNumber(account.redfoxIndex),
    reason: account.reason || account.recommendReason || '',
    recentVideos: Array.isArray(account.works)
      ? account.works.slice(0, 3).map(normalizeDouyinVideo)
      : [],
  }
}

function normalizeDouyinVideo(work: RedFoxDouyinWork): SimilarAccountVideo {
  return {
    title: work.title || firstLine(work.desc) || '无标题',
    coverUrl: work.coverUrl || '',
    videoUrl: work.workUrl || '',
    createTime: work.createTime || '',
    likes: numberValue(work.diggCount),
    comments: numberValue(work.commentCount),
    shares: numberValue(work.shareCount),
    views: numberValue(work.playCount),
    interactiveCount: numberValue(work.interactiveCount),
  }
}

// ── 小红书归一化 ──

function normalizeXhsAccounts(accounts: RedFoxXhsAccount[] | undefined): SimilarAccount[] {
  return Array.isArray(accounts)
    ? accounts.map(normalizeXhsAccount).filter((a): a is SimilarAccount => Boolean(a))
    : []
}

function normalizeXhsAccount(account: RedFoxXhsAccount | undefined): SimilarAccount | null {
  if (!account) return null
  const platformUserId = account.redId || ''
  const targetUrl = account.url || (platformUserId ? `https://www.xiaohongshu.com/user/profile/${platformUserId}` : '')

  return {
    nickname: account.nickname || '',
    avatar: account.avatar || '',
    targetUrl,
    platformUserId,
    followerCount: numberValue(account.fansCount),
    redfoxScore: nullableNumber(account.redfoxIndex),
    reason: account.reason || account.recommendReason || '',
    recentVideos: Array.isArray(account.notes)
      ? account.notes.slice(0, 3).map(normalizeXhsNote)
      : [],
  }
}

function normalizeXhsNote(note: RedFoxXhsNote): SimilarAccountVideo {
  return {
    title: note.title || firstLine(note.desc) || '无标题',
    coverUrl: note.cover || '',
    videoUrl: note.noteUrl || '',
    createTime: note.createTime || '',
    likes: numberValue(note.likeCount),
    comments: numberValue(note.commentCount),
    shares: numberValue(note.shareCount),
    views: 0,
    interactiveCount: numberValue(note.collectCount),
  }
}

// ── 工具函数 ──

function firstLine(value: string | undefined): string {
  return value?.split(/\r?\n/, 1)[0]?.slice(0, 80) ?? ''
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
