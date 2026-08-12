"use client"

import { useEffect, useState } from "react"

import { WeeklyBusinessReview } from "@/features/aim/components/weekly-business-review"
import { fetchAimWeeklyReview, type AimWeeklyBusinessReview } from "@/lib/api/aim-weekly-review"

export function ProjectWeeklyBusinessReview({ projectId }: { projectId: string }) {
  const [review, setReview] = useState<AimWeeklyBusinessReview | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchAimWeeklyReview(projectId).then((value) => { if (!cancelled) setReview(value) }).catch(() => { if (!cancelled) setReview(null) })
    return () => { cancelled = true }
  }, [projectId])
  return review ? <div className="border-b px-3 py-2 sm:px-5"><WeeklyBusinessReview review={review} /></div> : null
}
