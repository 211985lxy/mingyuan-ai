import { ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { QualityCheckReport } from "@/lib/api/client"

function QualityDimensions({ report }: { report: QualityCheckReport }) {
  const dimensions = [
    { label: "开头吸引力", data: report.attraction },
    { label: "逻辑性", data: report.logic },
    { label: "去AI味", data: report.aiTaste },
    { label: "文笔质量", data: report.editorial },
  ]
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{dimensions.map((dimension) =>
    <div key={dimension.label} className="rounded-lg border p-2 text-center">
      <p className="text-[10px] text-muted-foreground">{dimension.label}</p>
      <p className={`text-xl font-bold ${dimension.data.passed ? "text-green-600" : "text-red-500"}`}>{dimension.data.score}</p>
    </div>)}</div>
}

function PublishViolations({ check }: { check: NonNullable<QualityCheckReport["publishCheck"]> }) {
  if (!check.violations.length) return <p className="text-sm text-muted-foreground">未发现明显发布违规风险。</p>
  return <div className="space-y-2">{check.violations.map((violation) =>
    <div
      key={`${violation.ruleId || ""}-${violation.text}-${violation.category}`}
      className={`rounded-lg border p-3 text-sm ${violation.advisory ? "border-dashed opacity-90" : ""}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium">「{violation.text}」</span>
        {violation.ruleId ? <Badge variant="outline" className="text-[10px]">{violation.ruleId}</Badge> : null}
        <Badge variant={violation.advisory ? "secondary" : violation.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">
          {violation.advisory ? "仅提示" : violation.category}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{violation.reason}</p>
      {violation.evidence ? <p className="mt-1 text-xs text-muted-foreground">{violation.evidence}</p> : null}
      <p className="mt-1 text-xs text-foreground">{violation.suggest}</p>
    </div>)}</div>
}

function TrafficPotential({ check }: { check: NonNullable<QualityCheckReport["publishCheck"]> }) {
  return <>
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">流量潜力评分<Badge variant={check.trafficScore.score >= 80 ? "default" : "secondary"} className="ml-auto">{check.trafficScore.score}分 · {check.trafficScore.level}</Badge></div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{check.trafficScore.reasons.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
    <p className="text-xs text-muted-foreground">{check.aiLabelReminder}</p>
    {check.trafficWeakness.length ? <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{check.trafficWeakness.map((item) => <li key={item}>{item}</li>)}</ul> : null}
    {check.violations.length && check.minimalRewrite ? <div className="rounded-lg bg-muted/40 p-3"><p className="mb-1 text-xs font-medium text-muted-foreground">最小改法</p><p className="whitespace-pre-wrap text-sm leading-6">{check.minimalRewrite}</p></div> : null}
  </>
}

function PublishCheck({ check }: { check: NonNullable<QualityCheckReport["publishCheck"]> }) {
  return <div className="mt-4 space-y-3 border-t pt-4">
    <div className="flex items-center gap-2 text-sm font-semibold">发布前自查<Badge variant={check.verdict === "可发" ? "default" : "destructive"} className="ml-auto">{check.verdict}</Badge></div>
    {check.disclaimer ? <p className="text-xs text-muted-foreground">{check.disclaimer}</p> : null}
    <PublishViolations check={check} />
    <TrafficPotential check={check} />
    {check.recheckHint ? <p className="text-xs text-muted-foreground">{check.recheckHint}</p> : null}
  </div>
}

/**
 * @description aimqualityreport
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AimQualityReport({ report }: { report: QualityCheckReport }) {
  return <div className="mt-2 w-full rounded-xl border border-primary/20 bg-card p-4">
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />质检报告<Badge variant={report.overall.passed ? "default" : "destructive"} className="ml-auto">{report.overall.score}分 {report.overall.passed ? "通过" : "需修改"}</Badge></div>
    <QualityDimensions report={report} />
    {report.publishCheck ? <PublishCheck check={report.publishCheck} /> : null}
  </div>
}
