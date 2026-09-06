import Link from "next/link"
import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { competitorReportStatusLabel, competitorReportTitle, formatCompetitorDate } from "@/lib/competitor/display"
import type { ApiCompetitorReport } from "@/types/api"

export type ReportScope = "all" | "account"

/**
 * @description recentreportscard
 * 历史报告列表，支持在「全部账号 / 当前账号」间切换（默认全部账号）。
 * @param options - 配置选项
 * @returns 无返回值
 */
export function RecentReportsCard({ reports, loading, scope = "all", onScopeChange }: {
  reports: ApiCompetitorReport[]
  loading: boolean
  scope?: ReportScope
  onScopeChange?: (scope: ReportScope) => void
}) {
  const emptyText = scope === "all"
    ? "还没有分析报告。点击任一账号的 AI 深度调查后会出现在这里。"
    : "当前账号还没有分析报告。点击该账号的 AI 深度调查后会出现在这里。"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />最近分析报告<Badge variant="secondary" className="text-xs ml-1">{reports.length}</Badge></CardTitle>
          {onScopeChange ? (
            <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
              <button type="button" onClick={() => onScopeChange("all")} className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-all ${scope === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>全部账号</button>
              <button type="button" onClick={() => onScopeChange("account")} className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-all ${scope === "account" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>当前账号</button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)}</div> : reports.length === 0 ? <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">{emptyText}</p> : (
          <div className="divide-y rounded-lg border">
            {reports.map((report) => <Link key={report.id} href={`/competitor/${report.id}`} className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{competitorReportTitle(report)}</p><p className="mt-0.5 text-xs text-muted-foreground">分析于 {formatCompetitorDate(report.completedAt ?? report.createdAt)}</p></div><div className="flex shrink-0 items-center gap-2">{report.overallScore != null ? <span className="text-sm font-semibold">{Math.round(report.overallScore)}分</span> : null}<Badge variant={report.status === "failed" ? "destructive" : "secondary"}>{competitorReportStatusLabel(report.status)}</Badge></div></Link>)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
