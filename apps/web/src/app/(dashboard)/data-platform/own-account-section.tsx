"use client"

import { useEffect, useState } from "react"
import { AlertCircle, BarChart3, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  fetchCreatorMetrics,
  type CreatorMetricsResult,
} from "@/lib/api/creator-metrics"

function formatCount(value?: number | null): string {
  if (value == null) return "—"
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString("zh-CN")
}

function formatDate(value?: string | null): string {
  if (!value) return "—"
  return value.slice(0, 10)
}

interface PlatformTotal {
  platform: string
  label: string
  posts: number
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  collects: number | null
}

/** 次指标格：统一空值与对齐。 */
function MetricCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{formatCount(value)}</p>
    </div>
  )
}

/** 平台总览卡：主指标（总播放）放大，次指标 2×2 等宽对齐。 */
function PlatformTotalsCards({ totals }: { totals: PlatformTotal[] }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
      {totals.map((p) => (
        <Card key={p.platform}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              {p.label}
              <Badge variant="secondary" className="text-xs font-normal">
                {p.posts} 条作品
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">总播放</p>
              <p className="text-2xl font-bold tabular-nums">{formatCount(p.views)}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/60 pt-2.5 sm:grid-cols-4">
              <MetricCell label="点赞" value={p.likes} />
              <MetricCell label="评论" value={p.comments} />
              <MetricCell label="收藏" value={p.collects} />
              <MetricCell label="分享" value={p.shares} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** 区块标题（数据源徽章 + 最近同步时间）。 */
function OwnAccountHeading({ metrics }: { metrics: Extract<CreatorMetricsResult, { status: "ok" }> }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <BarChart3 className="h-4 w-4" />
      我的账号表现
      <Badge variant="secondary" className="text-xs">
        数据源：明动数据雷达
      </Badge>
      {metrics.lastSyncedAt ? (
        <span className="text-xs font-normal">同步于 {formatDate(metrics.lastSyncedAt)}</span>
      ) : null}
    </h2>
  )
}

/** 错误态卡片（保留服务端真实原因 + 重试）。 */
function OwnAccountErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-start gap-2 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          重试
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * 已加载视图：仅平台总览卡。
 * 作品明细统一由页面底部的「近期作品」表呈现（含封面/话题/完播率），
 * 此处不再重复一张同源表格，避免页面冗长。
 */
function OwnAccountLoadedView({ metrics }: { metrics: Extract<CreatorMetricsResult, { status: "ok" }> }) {
  return <PlatformTotalsCards totals={metrics.platformTotals} />
}

/** 我的账号表现（创作者数据总线：数据雷达 → 飞书 → AIM），与对标账号形成对比视图。 */
export function OwnAccountSection() {
  const [metrics, setMetrics] = useState<CreatorMetricsResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    // 进入区块即拉取数据：同步置 loading 态属于预期的首屏行为（仓库惯例 warn 放行）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReloading(true)
    const end = new Date()
    const start = new Date(end.getTime() - 365 * 24 * 3600 * 1000)
    fetchCreatorMetrics({ start: start.toISOString(), end: end.toISOString() })
      .then((v) => {
        if (!cancelled) setMetrics(v)
      })
      .catch((error: unknown) => {
        // 保留服务端真实原因（如「账号尚未绑定项目」），给用户可行动的信息
        const message = error instanceof Error && error.message ? error.message : "读取失败"
        if (!cancelled) setMetrics({ status: "error", message })
      })
      .finally(() => {
        if (!cancelled) setReloading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function retry() {
    setReloadKey((key) => key + 1)
  }

  const heading = (
    <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <BarChart3 className="h-4 w-4" />
      我的账号表现
    </h2>
  )

  if (!metrics || reloading) {
    return (
      <section className="space-y-3" aria-label="我的账号表现">
        {heading}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {[0, 1, 2, 3, 4].map((index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3, 4].map((slot) => (
                  <div key={slot} className="space-y-1">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    )
  }

  if (metrics.status !== "ok") {
    return (
      <section className="space-y-3" aria-label="我的账号表现">
        {heading}
        <OwnAccountErrorCard
          message={
            metrics.status === "not_configured"
              ? "尚未配置创作者数据总线（LARK_CREATOR_METRICS_*）。在本机「明动数据雷达」同步后即可展示。"
              : metrics.message
          }
          onRetry={retry}
        />
      </section>
    )
  }

  return (
    <section className="space-y-3" aria-label="我的账号表现">
      <OwnAccountHeading metrics={metrics} />
      <OwnAccountLoadedView metrics={metrics} />
    </section>
  )
}
