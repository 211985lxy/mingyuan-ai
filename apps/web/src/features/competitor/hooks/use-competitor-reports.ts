import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { listCompetitorReports } from "@/lib/api/client"
import type { ApiCompetitorReport } from "@/types/api"

export function useCompetitorReports(targetUrl?: string) {
  const [reports, setReports] = useState<ApiCompetitorReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)

  const loadReports = useCallback(async (url: string, showLoading = true) => {
    if (showLoading) setReportsLoading(true)
    try {
      const data = await listCompetitorReports(1, 10, url)
      setReports(data.items)
    } catch {
      toast.error("加载分析历史失败")
    } finally {
      if (showLoading) setReportsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!targetUrl) return
    void loadReports(targetUrl)
  }, [loadReports, targetUrl])

  return { loadReports, reports, reportsLoading }
}
