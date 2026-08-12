import type { AimWeeklyBusinessReview } from "@/lib/api/aim-weekly-review"

function metric(value: number | null, suffix = ""): string {
  return value == null ? "待回填" : `${value}${suffix}`
}

export function WeeklyBusinessReview({ review }: { review: AimWeeklyBusinessReview }) {
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
    <section aria-label="本周经营复盘" className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4">
      {items.map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}
    </section>
  )
}
