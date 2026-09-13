export const ACCOUNT_WORK_INIT_KIND = "account_work_init"
export const TRANSCRIPT_LAZY_KIND = "account_work_transcript"

export const TRANSCRIPT_LOOKBACK_DAYS = 90
export const TRANSCRIPT_TOP_N = 30

export interface WorkSignalSnapshot {
  playCount?: number
  diggCount?: number
  commentCount?: number
  shareCount?: number
  collectCount?: number
}

export interface WorkProjectionInput {
  accountId: string
  userId: string
  projectId: string
  platform?: string
  awemeId: string
  title: string
  publishedAt: Date | null
  coverUrl: string | null
  shareUrl: string | null
  signalSnapshot: WorkSignalSnapshot | null
}

export function engagementScore(signal: WorkSignalSnapshot | null | undefined): number {
  if (!signal) return 0
  return (signal.playCount ?? 0)
    + (signal.diggCount ?? 0) * 8
    + (signal.commentCount ?? 0) * 12
    + (signal.shareCount ?? 0) * 10
    + (signal.collectCount ?? 0) * 6
}

export function shouldExtractTranscriptNow(input: {
  publishedAt: Date | null
  signal: WorkSignalSnapshot | null
  rankAmongAll: number
  now?: Date
  lookbackDays?: number
  topN?: number
}): boolean {
  const now = input.now ?? new Date()
  const lookbackMs = (input.lookbackDays ?? TRANSCRIPT_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000
  const recent = input.publishedAt
    ? now.getTime() - input.publishedAt.getTime() <= lookbackMs
    : false
  const top = input.rankAmongAll < (input.topN ?? TRANSCRIPT_TOP_N)
  return recent || top
}

export function accountHistoryIdempotencyKey(accountId: string): string {
  return `account-work-init:${accountId}`
}

export function transcriptIdempotencyKey(assetId: string): string {
  return `account-work-transcript:${assetId}`
}

export function summarizeAccountHistory(works: Array<{
  title: string
  publishedAt: Date | null
  signalSnapshot: WorkSignalSnapshot | null
  transcript: string | null
}>): { summary: string; bestTitle: string | null; worstTitle: string | null } {
  if (works.length === 0) {
    return { summary: "该账号还没有可注入的历史作品投影。", bestTitle: null, worstTitle: null }
  }
  const ranked = [...works].sort((a, b) => engagementScore(b.signalSnapshot) - engagementScore(a.signalSnapshot))
  const best = ranked[0]
  const worst = ranked[ranked.length - 1]
  const withTranscript = works.filter((work) => work.transcript?.trim()).length
  const lines = [
    `账号真实发布历史 ${works.length} 条。`,
    `其中 ${withTranscript} 条已有逐字稿。`,
    best ? `表现较好：${best.title}` : "",
    worst && worst !== best ? `表现较弱：${worst.title}` : "",
  ].filter(Boolean)
  return { summary: lines.join(" "), bestTitle: best?.title ?? null, worstTitle: worst?.title ?? null }
}

export function renderAccountHistoryBlock(input: {
  summary: string
  samples: Array<{ title: string; transcript: string | null; publishedAt: Date | null }>
}): string {
  if (!input.summary) return ""
  const lines = ["=== 账号真实发布历史 ===", input.summary]
  for (const sample of input.samples.slice(0, 8)) {
    const date = sample.publishedAt ? sample.publishedAt.toISOString().slice(0, 10) : "日期未知"
    lines.push(`- ${date} ${sample.title}`)
    if (sample.transcript?.trim()) lines.push(`  逐字稿摘要：${sample.transcript.replace(/\s+/g, " ").slice(0, 180)}`)
  }
  return lines.join("\n")
}
