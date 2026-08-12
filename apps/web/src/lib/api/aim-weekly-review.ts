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

export async function fetchAimWeeklyReview(projectId?: string): Promise<AimWeeklyBusinessReview> {
  const params = new URLSearchParams()
  if (projectId) params.set("projectId", projectId)
  const response = await request<{ review: AimWeeklyBusinessReview }>(`/api/aim/review/weekly?${params.toString()}`)
  return response.review
}
