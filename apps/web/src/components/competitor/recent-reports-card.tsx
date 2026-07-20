import Link from "next/link"
import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { competitorReportStatusLabel, competitorReportTitle, formatCompetitorDate } from "@/lib/competitor/display"
import type { ApiCompetitorReport } from "@/types/api"

/**
 * @description recentreportscard
 * @param options - 配置选项
 * @returns 无返回值
 */
export function RecentReportsCard({ reports, loading }: { reports: ApiCompetitorReport[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />最近分析报告<Badge variant="secondary" className="text-xs ml-1">{reports.length}</Badge></CardTitle></CardHeader>
      <CardContent>
        {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)}</div> : reports.length === 0 ? <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">当前账号还没有分析报告。点击该账号的 AI 深度调查后会出现在这里。</p> : (
          <div className="divide-y rounded-lg border">
            {reports.map((report) => <Link key={report.id} href={`/competitor/${report.id}`} className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{competitorReportTitle(report)}</p><p className="mt-0.5 text-xs text-muted-foreground">分析于 {formatCompetitorDate(report.completedAt ?? report.createdAt)}</p></div><div className="flex shrink-0 items-center gap-2">{report.overallScore != null ? <span className="text-sm font-semibold">{Math.round(report.overallScore)}分</span> : null}<Badge variant={report.status === "failed" ? "destructive" : "secondary"}>{competitorReportStatusLabel(report.status)}</Badge></div></Link>)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
