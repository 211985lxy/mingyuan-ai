import type { AimWeeklyBusinessReview, AimWeeklyNarrative, TaskAttributionInsight } from "@/lib/api/aim-weekly-review"

function metric(value: number | null, suffix = ""): string {
  return value == null ? "待回填" : `${value}${suffix}`
}

export function WeeklyBusinessReview({ review, taskInsights = [], narrative, monthlyReportHref }: {
  review: AimWeeklyBusinessReview
  taskInsights?: TaskAttributionInsight[]
  narrative?: AimWeeklyNarrative
  /** WP-E 月报入口：新标签打开一页式「内容→线索→成交」月报 */
  monthlyReportHref?: string
}) {
  const backfill = review.day7Backfill.due === 0
    ? "尚未到期"
    : `${Math.round(review.day7Backfill.filled / review.day7Backfill.due * 100)}%`
  const items = [
    ["已发布", metric(review.publishedCount)],
    ["有效线索", metric(review.qualifiedLeadCount)],
    ["预约", metric(review.appointmentCount)],
    ["成交", metric(review.dealCount)],
    ["收入", review.revenue == null ? "待回填" : `¥${review.revenue}`],
    ["复用资产", metric(review.reusedAssetCount)],
    ["7 天回填率", backfill],
  ]
  return (
    <section aria-label="本周经营复盘" className="space-y-2">
      {monthlyReportHref ? (
        <p className="text-right text-xs">
          <a href={monthlyReportHref} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
            本月经营月报（内容→线索→成交）→
          </a>
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4">
        {items.map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}
      </div>
      <TaskAttributionSection insights={taskInsights} />
      <NarrativeSection narrative={narrative} />
    </section>
  )
}

/** 四段式周报长文（WP-D 移交项）：自动初稿，对外使用前必须人审。 */
function NarrativeSection({ narrative }: { narrative?: AimWeeklyNarrative }) {
  if (!narrative || narrative.enabled === false) return null
  const sourceLabel = narrative.source === "llm"
    ? "AI 补写初稿"
    : narrative.source === "template"
      ? "模板初稿（AI 生成失败，原因如实标注）"
      : "无数据周"
  return (
    <details className="rounded-lg border p-3" aria-label="四段式周报">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        四段式周报（{sourceLabel} · 对外使用前必须人工审核）
      </summary>
      <pre className="mt-2 whitespace-pre-wrap break-words border-t border-border/60 pt-2 font-sans text-sm leading-6">{narrative.markdown}</pre>
      {narrative.fallbackReason ? (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">AI 补写失败原因：{narrative.fallbackReason}（已回退模板，未编造内容）</p>
      ) : null}
    </details>
  )
}

/** 选题归因（WP-D）：只陈列事实与样本提示，小样本不下结论。 */
function TaskAttributionSection({ insights }: { insights: TaskAttributionInsight[] }) {
  return (
    <div className="rounded-lg border p-3" aria-label="选题归因">
      <p className="text-xs font-medium text-muted-foreground">选题归因（按内容任务）</p>
      {insights.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted-foreground">本周期暂无已发布内容，暂无选题归因。</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {insights.map((insight) => (
            <li key={insight.contentTask} className="text-sm leading-6">
              <span className="font-medium">{insight.contentTask}</span>
              <span className="text-muted-foreground">
                ：发布 {insight.publishedCount} 条｜播放 {insight.viewsTotal == null ? "未回填" : insight.viewsTotal.toLocaleString()}｜可追溯线索 {insight.traceableLeadCount} 条｜来源不明 {insight.unknownLeadCount} 条
              </span>
              {insight.sampleNote ? <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">{insight.sampleNote}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
