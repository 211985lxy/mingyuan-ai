"use client"

import { useEffect, useState } from "react"

import { CreatorPlatformMetrics } from "@/features/aim/components/creator-platform-metrics"
import { WeeklyBusinessReview } from "@/features/aim/components/weekly-business-review"
import { fetchAimWeeklyReview, type AimWeeklyBusinessReview, type AimWeeklyNarrative, type TaskAttributionInsight } from "@/lib/api/aim-weekly-review"
import { fetchCreatorMetrics, type CreatorMetricsResult } from "@/lib/api/creator-metrics"

export function ProjectWeeklyBusinessReview({ projectId }: { projectId: string }) {
  const [review, setReview] = useState<AimWeeklyBusinessReview | null>(null)
  const [taskInsights, setTaskInsights] = useState<TaskAttributionInsight[]>([])
  const [narrative, setNarrative] = useState<AimWeeklyNarrative | undefined>(undefined)
  const [platformMetrics, setPlatformMetrics] = useState<CreatorMetricsResult | null>(null)
  useEffect(() => {
    let cancelled = false
    // 两个数据源相互独立：复盘失败不影响平台表现展示，反之亦然
    fetchAimWeeklyReview(projectId).then((value) => {
      if (cancelled) return
      setReview(value.review)
      setTaskInsights(value.taskInsights)
      setNarrative(value.narrative)
    }).catch(() => { if (!cancelled) setReview(null) })
    fetchCreatorMetrics({ projectId }).then((value) => { if (!cancelled) setPlatformMetrics(value) }).catch(() => { if (!cancelled) setPlatformMetrics(null) })
    return () => { cancelled = true }
  }, [projectId])
  if (!review) return null
  return (
    <div className="border-b px-3 py-2 sm:px-5">
      <WeeklyBusinessReview
        review={review}
        taskInsights={taskInsights}
        narrative={narrative}
        monthlyReportHref={`/api/aim/reports/monthly?projectId=${encodeURIComponent(projectId)}`}
      />
      <CreatorPlatformMetrics metrics={platformMetrics} />
    </div>
  )
}
