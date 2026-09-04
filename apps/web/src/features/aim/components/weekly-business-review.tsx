import type { AimWeeklyBusinessReview, TaskAttributionInsight } from "@/lib/api/aim-weekly-review"

function metric(value: number | null, suffix = ""): string {
  return value == null ? "待回填" : `${value}${suffix}`
}

export function WeeklyBusinessReview({ review, taskInsights = [] }: {
  review: AimWeeklyBusinessReview
  taskInsights?: TaskAttributionInsight[]
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
      <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4">
        {items.map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}
      </div>
      <TaskAttributionSection insights={taskInsights} />
    </section>
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
