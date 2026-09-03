import type { CreatorMetricsResult } from "@/lib/api/creator-metrics"

function formatCount(value: number | null): string {
  if (value == null) return "—"
  return value >= 10000 ? `${(value / 10000).toFixed(1)}w` : String(value)
}

function formatFreshness(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "未知（未读同步日志）"
}

function PlatformTotals({ metrics }: { metrics: Extract<CreatorMetricsResult, { status: "ok" }> }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.platformTotals.map((total) => (
        <div key={total.label} className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">{total.label}（{total.posts} 条）</p>
          <p className="mt-1 text-sm font-semibold">播放 {formatCount(total.views)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            赞 {formatCount(total.likes)} · 评 {formatCount(total.comments)} · 分 {formatCount(total.shares)} · 藏 {formatCount(total.collects)}
          </p>
        </div>
      ))}
    </div>
  )
}

/**
 * 创作者平台表现（飞书数据总线，上游工具同步）。
 * 三态：ok 展示真实指标与「自动同步」徽标；not_configured 展示配置引导；
 * error 展示可行动错误。总线数据不与人工回填指标混算。
 */
export function CreatorPlatformMetrics({ metrics }: { metrics: CreatorMetricsResult | null }) {
  if (!metrics) return null
  if (metrics.status === "not_configured") {
    return (
      <section aria-label="创作者平台表现" className="mt-2 rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
        平台表现自动同步未配置：在你自己的电脑上安装上游采集工具并同步到飞书后，这里会显示抖音 / 小红书 / B 站 / 快手的真实作品数据。当前请继续使用下方人工回填。
      </section>
    )
  }
  if (metrics.status === "error") {
    return (
      <section aria-label="创作者平台表现" className="mt-2 rounded-md bg-red-50 p-2.5 text-xs leading-5 text-red-600">
        平台数据读取失败：{metrics.message}（已保留人工回填数据，可稍后重试）
      </section>
    )
  }
  return (
    <section aria-label="创作者平台表现" className="mt-2 rounded-md border p-2.5">
      <div className="flex items-center gap-2">
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">自动同步</span>
        <p className="text-xs text-muted-foreground">
          本周期发布 {metrics.period.publishedCount} 条 · 播放 {formatCount(metrics.period.views)} · 互动 {formatCount(metrics.period.interactions)}
        </p>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">数据截至 {formatFreshness(metrics.lastSyncedAt)}（指标为作品当前累计值）</p>
      {metrics.warnings.length > 0 ? <p className="mt-1 text-[11px] text-amber-600">{metrics.warnings[0]}</p> : null}
      <PlatformTotals metrics={metrics} />
    </section>
  )
}
