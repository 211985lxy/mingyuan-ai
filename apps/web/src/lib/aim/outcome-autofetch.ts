/**
 * 效果数据自动回流：把抖音官方作品列表对到已发布 AimGeneration，只写内容信号。
 * 商业结果与判断码永远留给人。单账号失败不阻断批次。
 */
import {
  classifyPublishedWorkKey,
  isDouyinPublishPlatform,
  type PublishedWorkKey,
} from "@/lib/aim/platform-post-id"
import {
  normalizeDouyinAwemeId,
  resolveDouyinShortUrl,
} from "@/lib/douyin-short-url"

export {
  classifyPublishedWorkKey,
  isDouyinPublishPlatform,
  isValidPublishedWorkKey,
} from "@/lib/aim/platform-post-id"

const DAY_MS = 24 * 60 * 60 * 1000

export type CollectWindowDay = 7 | 14 | 30

export interface PublishedGenerationRow {
  id: string
  userId: string
  projectId: string | null
  topicSelectionId: string | null
  publishPlatform: string | null
  publishUrl: string | null
  publishedAt: Date | null
}

export interface AutofetchVideoRow {
  itemId: string
  videoId: string | null
  shareUrl: string | null
  statistics: {
    playCount?: number
    diggCount?: number
    commentCount?: number
    collectCount?: number
    shareCount?: number
  } | null
}

export interface AutofetchBindingRow {
  id: string
  userId: string
  openId: string
}

export interface BackfillItem {
  generationId: string
  userId: string
  reason: "unparseable_work_key" | "not_in_recent_videos" | "token_expired" | "no_douyin_binding"
  publishUrl: string | null
}

export interface OutcomeAutofetchSummary {
  usersProcessed: number
  upserted: number
  unmatched: number
  tooEarly: number
  tokenMissing: number
  tokenExpired: number
  accountErrors: number
  needsBackfill: BackfillItem[]
}

export interface OutcomeAutofetchStore {
  listPublishedGenerations(): Promise<PublishedGenerationRow[]>
  listBindings(userId: string): Promise<AutofetchBindingRow[]>
  fetchVideosForBinding(binding: AutofetchBindingRow): Promise<AutofetchVideoRow[]>
  upsertContentSignals(input: {
    userId: string
    generationId: string
    projectId: string | null
    topicSelectionId: string | null
    collectWindowDay: CollectWindowDay
    publishedAt: Date | null
    platform: "抖音"
    views: number | null
    likes: number | null
    comments: number | null
    saves: number | null
    shares: number | null
  }): Promise<void>
  markBindingExpired(binding: AutofetchBindingRow): Promise<void>
  alert(input: { fingerprint: string; summary: string }): Promise<void>
  getBoundProjectId?(userId: string): Promise<string | null>
}

/**
 * 当前该写入哪一个采集窗口。
 * T+1 起（稿件发布时间已过）写入 7 日窗口，每天覆盖更新到满 14 天；
 * 满 14 天改写 14 日行，满 30 天改写 30 日行。后期快照不回填进更早窗口。
 */
export function resolveCollectWindowDay(publishedAt: Date, now: Date): CollectWindowDay | null {
  if (publishedAt.getTime() > now.getTime()) return null
  const ageDays = Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS)
  if (ageDays < 14) return 7
  if (ageDays < 30) return 14
  return 30
}

function videoMatchesAweme(video: AutofetchVideoRow, awemeId: string): boolean {
  if (video.itemId === awemeId || video.videoId === awemeId) return true
  if (video.shareUrl && normalizeDouyinAwemeId(video.shareUrl) === awemeId) return true
  return false
}

function isExpiredError(error: unknown): boolean {
  return Boolean(
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "expired",
  )
}

function emptySummary(): OutcomeAutofetchSummary {
  return {
    usersProcessed: 0,
    upserted: 0,
    unmatched: 0,
    tooEarly: 0,
    tokenMissing: 0,
    tokenExpired: 0,
    accountErrors: 0,
    needsBackfill: [],
  }
}

function groupByUser(rows: PublishedGenerationRow[]): Map<string, PublishedGenerationRow[]> {
  const grouped = new Map<string, PublishedGenerationRow[]>()
  for (const row of rows) {
    const list = grouped.get(row.userId) ?? []
    list.push(row)
    grouped.set(row.userId, list)
  }
  return grouped
}

async function resolveAwemeId(
  classified: PublishedWorkKey,
  resolveShortUrl: (url: string) => Promise<string>,
): Promise<string | null> {
  if (classified.status === "aweme") return classified.awemeId
  if (classified.status !== "short") return null
  return normalizeDouyinAwemeId(await resolveShortUrl(classified.url))
}

type EligibleRow = { row: PublishedGenerationRow; awemeId: string; window: CollectWindowDay }

function pushBackfill(
  summary: OutcomeAutofetchSummary,
  row: PublishedGenerationRow,
  reason: BackfillItem["reason"],
) {
  summary.needsBackfill.push({
    generationId: row.id,
    userId: row.userId,
    reason,
    publishUrl: row.publishUrl,
  })
}

async function collectEligibleGenerations(input: {
  userId: string
  generations: PublishedGenerationRow[]
  store: OutcomeAutofetchStore
  now: Date
  resolveShortUrl: (url: string) => Promise<string>
  summary: OutcomeAutofetchSummary
}): Promise<EligibleRow[]> {
  const boundProjectId = await input.store.getBoundProjectId?.(input.userId)
  const eligible: EligibleRow[] = []
  for (const row of input.generations) {
    if (boundProjectId && row.projectId && row.projectId !== boundProjectId) continue
    if (!isDouyinPublishPlatform(row.publishPlatform)) continue
    const classified = classifyPublishedWorkKey(row.publishPlatform, row.publishUrl)
    const awemeId = classified.status === "missing"
      ? null
      : await resolveAwemeId(classified, input.resolveShortUrl)
    if (!awemeId) {
      pushBackfill(input.summary, row, "unparseable_work_key")
      continue
    }
    if (!row.publishedAt) continue
    const window = resolveCollectWindowDay(row.publishedAt, input.now)
    if (!window) {
      input.summary.tooEarly += 1
      continue
    }
    eligible.push({ row, awemeId, window })
  }
  return eligible
}

async function loadAccountVideos(input: {
  userId: string
  store: OutcomeAutofetchStore
  summary: OutcomeAutofetchSummary
}): Promise<{ videos: AutofetchVideoRow[]; expiredBindings: number } | "no_binding"> {
  const bindings = await input.store.listBindings(input.userId)
  if (bindings.length === 0) return "no_binding"
  const videos: AutofetchVideoRow[] = []
  let expiredBindings = 0
  for (const binding of bindings) {
    try {
      videos.push(...await input.store.fetchVideosForBinding(binding))
    } catch (error) {
      if (!isExpiredError(error)) throw error
      expiredBindings += 1
      input.summary.tokenExpired += 1
      await input.store.markBindingExpired(binding)
      await input.store.alert({
        fingerprint: `outcome-autofetch:token-expired:${binding.id}`,
        summary: `抖音绑定 ${binding.openId} 授权失效，效果回流已跳过该账号`,
      })
    }
  }
  return { videos, expiredBindings }
}

async function upsertMatchedSignals(input: {
  eligible: EligibleRow[]
  videos: AutofetchVideoRow[]
  store: OutcomeAutofetchStore
  summary: OutcomeAutofetchSummary
}): Promise<void> {
  for (const item of input.eligible) {
    const video = input.videos.find((candidate) => videoMatchesAweme(candidate, item.awemeId))
    if (!video) {
      input.summary.unmatched += 1
      pushBackfill(input.summary, item.row, "not_in_recent_videos")
      continue
    }
    await input.store.upsertContentSignals({
      userId: item.row.userId,
      generationId: item.row.id,
      projectId: item.row.projectId,
      topicSelectionId: item.row.topicSelectionId,
      collectWindowDay: item.window,
      publishedAt: item.row.publishedAt,
      platform: "抖音",
      views: video.statistics?.playCount ?? null,
      likes: video.statistics?.diggCount ?? null,
      comments: video.statistics?.commentCount ?? null,
      saves: video.statistics?.collectCount ?? null,
      shares: video.statistics?.shareCount ?? null,
    })
    input.summary.upserted += 1
  }
}

async function autofetchUser(input: {
  userId: string
  generations: PublishedGenerationRow[]
  store: OutcomeAutofetchStore
  now: Date
  resolveShortUrl: (url: string) => Promise<string>
  summary: OutcomeAutofetchSummary
}): Promise<void> {
  const eligible = await collectEligibleGenerations(input)
  if (eligible.length === 0) return
  const loaded = await loadAccountVideos(input)
  if (loaded === "no_binding") {
    input.summary.tokenMissing += 1
    for (const item of eligible) pushBackfill(input.summary, item.row, "no_douyin_binding")
    return
  }
  if (loaded.videos.length === 0 && loaded.expiredBindings > 0) {
    for (const item of eligible) {
      input.summary.unmatched += 1
      pushBackfill(input.summary, item.row, "token_expired")
    }
    return
  }
  await upsertMatchedSignals({ eligible, videos: loaded.videos, store: input.store, summary: input.summary })
}

export async function runOutcomeAutofetch(input: {
  store: OutcomeAutofetchStore
  now?: Date
  resolveShortUrl?: (url: string) => Promise<string>
}): Promise<OutcomeAutofetchSummary> {
  const now = input.now ?? new Date()
  const resolveShortUrl = input.resolveShortUrl ?? resolveDouyinShortUrl
  const summary = emptySummary()
  const grouped = groupByUser(await input.store.listPublishedGenerations())
  summary.usersProcessed = grouped.size

  for (const [userId, generations] of grouped) {
    try {
      await autofetchUser({ userId, generations, store: input.store, now, resolveShortUrl, summary })
    } catch {
      summary.accountErrors += 1
    }
  }
  return summary
}

