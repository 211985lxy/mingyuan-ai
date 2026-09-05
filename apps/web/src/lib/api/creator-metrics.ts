"use client"

import { request } from "@/lib/api/core"

/** 创作者平台表现（飞书数据总线）。与服务端 CreatorMetricsResponse 结构保持一致。 */
export type CreatorPlatformMetric = {
  recordId: string
  postId: string
  platform: string
  platformLabel: string
  title: string
  publishedAt: string | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  collects: number | null
  followersDelta: number | null
  /** 质量指标（数据雷达同步，可能缺省）：小数比例或 null */
  quality: {
    completionRate: number | null
    likeRate: number | null
    commentRate: number | null
    shareRate: number | null
    collectRate: number | null
    coverClickRate: number | null
    bounceRate3s: number | null
  } | null
}

export type CreatorMetricsResult =
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ok"
      fetchedAt: string
      lastSyncedAt: string | null
      posts: CreatorPlatformMetric[]
      skipped: number
      warnings: string[]
      period: {
        start: string
        end: string
        publishedCount: number
        views: number | null
        interactions: number | null
      }
      platformTotals: Array<{
        platform: string
        label: string
        posts: number
        views: number | null
        likes: number | null
        comments: number | null
        shares: number | null
        collects: number | null
      }>
    }

function buildCreatorMetricsPath(start?: string, end?: string, projectId?: string): string {
  const params = new URLSearchParams()
  if (start) params.set("start", start)
  if (end) params.set("end", end)
  if (projectId) params.set("projectId", projectId)
  const query = params.toString()
  return `/api/aim/creator-metrics${query ? `?${query}` : ""}`
}

export async function fetchCreatorMetrics(input?: {
  start?: string
  end?: string
  projectId?: string
}): Promise<CreatorMetricsResult> {
  return request<CreatorMetricsResult>(buildCreatorMetricsPath(input?.start, input?.end, input?.projectId))
}
