import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { CompetitorDiagnosisViewModel } from "@/lib/competitor-diagnosis/types"

function Field({ label, value }: { label: string; value?: string | string[] | null }) {
  if (value === null || value === undefined) return null
  if (Array.isArray(value) && value.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      {Array.isArray(value) ? (
        <ul className="space-y-1">
          {value.map((v, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span className="text-foreground/90">{v}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed">{value}</p>
      )}
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  )
}

/**
 * 原始报告附录：折叠保留旧分析内容，方便查原始报告，不干扰主判断。
 */
export function RawReportAppendix({ vm }: { vm: CompetitorDiagnosisViewModel }) {
  const sections = vm.rawAnalysis.analysisResult?.sections
  if (!sections) return null

  const ov = sections.account_overview
  const growth = sections.growth_analysis
  const eng = sections.engagement_analysis
  const mon = sections.monetization_analysis
  const rec = sections.recommendations

  return (
    <details className="group">
      <summary className="list-none cursor-pointer flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ChevronDown className="h-4 w-4 group-open:rotate-180 transition-transform" />
        展开原始分析报告（附录）
      </summary>

      <Card className="mt-3">
        <CardContent className="p-5 space-y-6">
          {(ov?.account_type || ov?.content_vertical || ov?.positioning || ov?.differentiator) && (
            <FieldGroup title="账号定位">
              <Field label="账号类型" value={ov?.account_type} />
              <Field label="内容垂类" value={ov?.content_vertical} />
              <Field label="账号定位" value={ov?.positioning} />
              <Field label="差异化优势" value={ov?.differentiator} />
            </FieldGroup>
          )}

          {(growth?.growth_trend || growth?.growth_drivers || growth?.follower_quality) && (
            <FieldGroup title="增长分析">
              <Field label="增长趋势" value={growth?.growth_trend} />
              <Field label="增长驱动因素" value={growth?.growth_drivers} />
              <Field label="粉丝质量" value={growth?.follower_quality} />
            </FieldGroup>
          )}

          {(eng?.comment_quality || eng?.anomaly_detection) && (
            <FieldGroup title="互动分析">
              <Field label="评论质量" value={eng?.comment_quality} />
              <Field label="异常检测" value={eng?.anomaly_detection} />
            </FieldGroup>
          )}

          {(mon?.monetization_paths || mon?.product_categories || mon?.estimated_revenue_level) && (
            <FieldGroup title="变现分析">
              <Field label="变现路径" value={mon?.monetization_paths} />
              <Field label="产品品类" value={mon?.product_categories} />
              <Field label="预估收益水平" value={mon?.estimated_revenue_level} />
            </FieldGroup>
          )}

          {(rec?.reusable_strategies || rec?.differentiation_points || rec?.action_plan_30d || rec?.risks) && (
            <FieldGroup title="分析建议">
              <Field label="可复用策略" value={rec?.reusable_strategies} />
              <Field label="差异化切入点" value={rec?.differentiation_points} />
              <Field label="30天行动计划" value={rec?.action_plan_30d} />
              <Field label="风险提示" value={rec?.risks} />
            </FieldGroup>
          )}
        </CardContent>
      </Card>
    </details>
  )
}
