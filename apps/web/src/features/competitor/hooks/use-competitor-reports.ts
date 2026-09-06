import { useCallback, useState } from "react"
import { toast } from "sonner"
import { listCompetitorReports } from "@/lib/api/client"
import type { ApiCompetitorReport } from "@/types/api"

/**
 * @description React Hook：competitorreports
 * 报告历史默认按「全部账号」加载；传入 targetUrl 时按单个账号过滤。
 * @returns 无返回值
 */
export function useCompetitorReports() {
  const [reports, setReports] = useState<ApiCompetitorReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)

  const loadReports = useCallback(async (url?: string, showLoading = true) => {
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

  return { loadReports, reports, reportsLoading }
}
