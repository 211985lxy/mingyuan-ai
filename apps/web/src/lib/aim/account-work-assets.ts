/**
 * 账号历史作品资产（WP-A1）纯逻辑层。
 * 目标：账号接入即全量初始化——把账号过去发布的全部作品（标题/数据/封面/逐字稿）
 * 变成编导智能体的全局上下文，让"该拍什么"参考真实发布历史而不是凭感觉。
 *
 * 本文件只放纯逻辑（幂等合并 / 逐字稿提取计划 / 历史摘要），Prisma 读写适配与
 * 触发接线（绑定成功 → 后台任务回补）在 WP-1.1 合入后接上（见增量计划依赖关系）。
 * 逐字稿成本纪律：只对「近 90 天 + 互动量 Top N」主动提取，其余懒提取，绝不重复提取。
 */

import { createHash } from "node:crypto"

export type TranscriptStatus = "none" | "pending" | "ready" | "failed"

export interface AccountWorkLike {
  externalWorkId: string
  title: string
  coverUrl: string | null
  publishedAt: string | null
  stats: WorkStats
  transcript: string | null
  transcriptStatus: TranscriptStatus
  transcriptAttempts: number
}

export interface WorkStats {
  views?: number
  likes?: number
  comments?: number
  saves?: number
  shares?: number
}

export interface TranscriptPlanItem {
  externalWorkId: string
  reason: "high_priority_window" | "retry_failed"
  priority: number
}

export const TRANSCRIPT_WINDOW_DAYS = 90
export const TRANSCRIPT_TOP_N = 30
export const TRANSCRIPT_MAX_ATTEMPTS = 3

export function readWorkStats(raw: unknown): WorkStats {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const source = raw as Record<string, unknown>
  const stats: WorkStats = {}
  for (const key of ["views", "likes", "comments", "saves", "shares"] as const) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) stats[key] = value
  }
  return stats
}

function totalInteractions(stats: WorkStats): number {
  return (stats.likes ?? 0) + (stats.comments ?? 0) + (stats.saves ?? 0) + (stats.shares ?? 0)
}

function toTime(value: string | null): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

/**
 * 幂等合并：按 externalWorkId 对齐，incoming 的展示/数据字段胜出（更新鲜），
 * existing 的逐字稿成果保留（提取是有成本的一次性资产，绝不被同步覆盖）。
 */
export function dedupeAndMergeWorks(
  existing: AccountWorkLike[],
  incoming: AccountWorkLike[],
): AccountWorkLike[] {
  const byId = new Map<string, AccountWorkLike>()
  for (const row of existing) byId.set(row.externalWorkId, { ...row })
  for (const row of incoming) {
    const current = byId.get(row.externalWorkId)
    if (!current) {
      byId.set(row.externalWorkId, { ...row })
      continue
    }
    byId.set(row.externalWorkId, {
      ...row,
      transcript: current.transcript,
      transcriptStatus: current.transcriptStatus,
      transcriptAttempts: current.transcriptAttempts,
    })
  }
  return [...byId.values()]
}

/**
 * 逐字稿提取计划：近 90 天内按互动量排序取 Top N；
 * ready/pending 跳过；failed 未超最大尝试次数的按原优先级重试。
 */
export function planTranscriptExtraction(
  works: AccountWorkLike[],
  options: { windowDays?: number; topN?: number; now?: string } = {},
): TranscriptPlanItem[] {
  const windowDays = options.windowDays ?? TRANSCRIPT_WINDOW_DAYS
  const topN = options.topN ?? TRANSCRIPT_TOP_N
  const nowTime = toTime(options.now ?? new Date().toISOString()) ?? Date.now()

  const candidates = works
    .filter((work) => work.transcriptStatus !== "ready" && work.transcriptStatus !== "pending")
    .map((work) => ({ work, publishedTime: toTime(work.publishedAt) }))
    .filter(({ work, publishedTime }) => {
      if (work.transcriptStatus === "failed" && work.transcriptAttempts >= TRANSCRIPT_MAX_ATTEMPTS) return false
      if (publishedTime === null) return true // 缺发布时间的老数据按候选处理
      return nowTime - publishedTime <= windowDays * 24 * 60 * 60 * 1000
    })
    .map(({ work }) => ({
      externalWorkId: work.externalWorkId,
      interactions: totalInteractions(work.stats),
      isRetry: work.transcriptStatus === "failed",
    }))

  candidates.sort((a, b) => {
    if (a.isRetry !== b.isRetry) return a.isRetry ? -1 : 1 // 失败重试优先（保住 Top N 覆盖率）
    return b.interactions - a.interactions
  })

  return candidates.slice(0, topN).map((item, index) => ({
    externalWorkId: item.externalWorkId,
    reason: item.isRetry ? "retry_failed" : "high_priority_window",
    priority: index + 1,
  }))
}

export interface AccountHistoryDigest {
  totalWorks: number
  publishedWithinWindow: number
  topWorks: Array<{ title: string; views: number }>
  digest: string
  hash: string
}

/**
 * 历史摘要（进生成上下文的形态）：确定性输出（排序稳定），配 sha256 供
 * run metadata 打点（accountHistoryHash），复盘可回答"这次生成带了哪些历史事实"。
 */
export function buildAccountHistoryDigest(
  works: AccountWorkLike[],
  options: { windowDays?: number; now?: string } = {},
): AccountHistoryDigest {
  const windowDays = options.windowDays ?? TRANSCRIPT_WINDOW_DAYS
  const nowTime = toTime(options.now ?? new Date().toISOString()) ?? Date.now()

  const sorted = works
    .slice()
    .sort((a, b) => (toTime(b.publishedAt) ?? 0) - (toTime(a.publishedAt) ?? 0))
  const withinWindow = sorted.filter((work) => {
    const time = toTime(work.publishedAt)
    return time !== null && nowTime - time <= windowDays * 24 * 60 * 60 * 1000
  })

  const topWorks = sorted
    .slice()
    .sort((a, b) => (b.stats.views ?? 0) - (a.stats.views ?? 0))
    .slice(0, 5)
    .map((work) => ({ title: work.title, views: work.stats.views ?? 0 }))

  const lines: string[] = []
  lines.push(`账号历史发布：共 ${sorted.length} 条作品，近 ${windowDays} 天 ${withinWindow.length} 条。`)
  if (topWorks.length > 0) {
    lines.push("历史表现最好的作品（按播放）：")
    for (const [index, item] of topWorks.entries()) {
      lines.push(`${index + 1}. ${item.title}（播放 ${item.views}）`)
    }
  }

  const digest = lines.join("\n")
  const hash = sha256Hex(digest)
  return {
    totalWorks: sorted.length,
    publishedWithinWindow: withinWindow.length,
    topWorks,
    digest,
    hash,
  }
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}
