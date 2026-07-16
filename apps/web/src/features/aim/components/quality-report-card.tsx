import { ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { QualityCheckReport } from "@/lib/api/client"

export function QualityReportCard({ report }: { report: QualityCheckReport }) {
  return (
    <div className="mt-2 w-full rounded-xl border border-primary/20 bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" />
        质检报告
        <Badge variant={report.overall.passed ? "default" : "destructive"} className="ml-auto">
          {report.overall.score}分 {report.overall.passed ? "通过" : "需修改"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "开头吸引力", data: report.attraction },
          { label: "逻辑性", data: report.logic },
          { label: "去AI味", data: report.aiTaste },
          { label: "文笔质量", data: report.editorial },
        ].map((dim) => (
          <div key={dim.label} className="rounded-lg border p-2 text-center">
            <p className="text-[10px] text-muted-foreground">{dim.label}</p>
            <p className={`text-xl font-bold ${dim.data.passed ? "text-green-600" : "text-red-500"}`}>{dim.data.score}</p>
          </div>
        ))}
      </div>
      {report.publishCheck && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            抖音发布前自查
            <Badge variant={report.publishCheck.verdict === "可发" ? "default" : "destructive"} className="ml-auto">
              {report.publishCheck.verdict}
            </Badge>
          </div>
          {report.publishCheck.violations.length > 0 ? (
            <div className="space-y-2">
              {report.publishCheck.violations.map((violation) => (
                <div key={`${violation.text}-${violation.category}`} className="rounded-lg border p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium">「{violation.text}」</span>
                    <Badge variant={violation.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">
                      {violation.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{violation.reason}</p>
                  <p className="mt-1 text-xs text-foreground">{violation.suggest}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">未发现明显发布违规风险。</p>
          )}
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              流量潜力评分
              <Badge variant={report.publishCheck.trafficScore.score >= 80 ? "default" : "secondary"} className="ml-auto">
                {report.publishCheck.trafficScore.score}分 · {report.publishCheck.trafficScore.level}
              </Badge>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {report.publishCheck.trafficScore.reasons.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">{report.publishCheck.aiLabelReminder}</p>
          {report.publishCheck.trafficWeakness.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {report.publishCheck.trafficWeakness.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {report.publishCheck.violations.length > 0 && report.publishCheck.minimalRewrite !== "" && (
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">最小改法</p>
              <p className="whitespace-pre-wrap text-sm leading-6">{report.publishCheck.minimalRewrite}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
