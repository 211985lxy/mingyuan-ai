"use client"

import { request } from "@/lib/api/core"

export interface AimWeeklyBusinessReview {
  periodStart: string
  periodEnd: string
  publishedCount: number
  qualifiedLeadCount: number
  appointmentCount: number
  dealCount: number | null
  revenue: number | null
  referencedAssetCount: number
  reusedAssetCount: number
  day7Backfill: { due: number; filled: number }
}

/** 选题归因聚合（WP-D）：哪类选题带来播放、哪类带来可追溯线索。 */
export interface TaskAttributionInsight {
  contentTask: string
  publishedCount: number
  /** 全部未回填时为 null（空值≠0） */
  viewsTotal: number | null
  traceableLeadCount: number
  unknownLeadCount: number
  sampleNote: string | null
}

export interface AimWeeklyReviewPayload {
  review: AimWeeklyBusinessReview
  taskInsights: TaskAttributionInsight[]
}

export async function fetchAimWeeklyReview(projectId?: string): Promise<AimWeeklyReviewPayload> {
  const params = new URLSearchParams()
  if (projectId) params.set("projectId", projectId)
  const response = await request<{
    review: AimWeeklyBusinessReview
    taskInsights?: TaskAttributionInsight[]
  }>(`/api/aim/review/weekly?${params.toString()}`)
  return { review: response.review, taskInsights: response.taskInsights ?? [] }
}
