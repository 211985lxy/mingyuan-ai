import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { listCompetitorReports } from "@/lib/api/client"
import type { ApiCompetitorReport } from "@/types/api"

/**
 * @description React Hook：competitorreports
 * @param targetUrl? - 目标Url?
 * @returns 无返回值
 */
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
    const timer = window.setTimeout(() => void loadReports(targetUrl), 0)
    return () => window.clearTimeout(timer)
  }, [loadReports, targetUrl])

  return { loadReports, reports, reportsLoading }
}
