"use client"

import { useEffect, useState } from "react"
import { BarChart3, Eye } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchCreatorMetrics,
  type CreatorMetricsResult,
} from "@/lib/api/creator-metrics"

function formatCount(value?: number | null): string {
  if (value == null) return "—"
  return value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value.toLocaleString("zh-CN")
}

function formatPct(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—"
  return `${(value * 100).toFixed(1)}%`
}

function formatDate(value?: string | null): string {
  if (!value) return "—"
  return value.slice(0, 10)
}

/** 质量指标上游可能存 0-1 小数或百分数，统一按小数展示。 */
function pickRate(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—"
  return formatPct(value > 1 ? value / 100 : value)
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

interface OwnPost {
  postId: string
  title: string
  publishedAt: string | null
  views: number | null
  likes: number | null
  comments: number | null
  collects: number | null
  quality: { completionRate: number | null } | null
}

/** 平台总览卡（每个平台一张）。 */
function PlatformTotalsCards({ totals }: { totals: PlatformTotal[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {totals.map((p) => (
        <Card key={p.platform}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              {p.label}
              <span className="text-xs font-normal text-muted-foreground">{p.posts} 条作品</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">总播放</p>
              <p className="text-lg font-semibold">{p.views == null ? "—" : formatCount(p.views)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">点赞</p>
              <p className="text-lg font-semibold">{p.likes == null ? "—" : formatCount(p.likes)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">评论</p>
              <p>{p.comments == null ? "—" : formatCount(p.comments)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">收藏</p>
              <p>{p.collects == null ? "—" : formatCount(p.collects)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">分享</p>
              <p>{p.shares == null ? "—" : formatCount(p.shares)}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** 近期作品表（按发布时间，最多 8 条，含完播率）。 */
function RecentOwnPosts({ posts }: { posts: OwnPost[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Eye className="h-4 w-4" />
          近期作品（按发布时间，最多展示 8 条）
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>作品</TableHead>
              <TableHead className="text-right">发布日期</TableHead>
              <TableHead className="text-right">播放</TableHead>
              <TableHead className="text-right">点赞</TableHead>
              <TableHead className="text-right">评论</TableHead>
              <TableHead className="text-right">收藏</TableHead>
              <TableHead className="text-right">完播率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow key={post.postId}>
                <TableCell className="max-w-[280px] truncate font-medium">{post.title}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatDate(post.publishedAt)}
                </TableCell>
                <TableCell className="text-right">{formatCount(post.views)}</TableCell>
                <TableCell className="text-right">{formatCount(post.likes)}</TableCell>
                <TableCell className="text-right">{formatCount(post.comments)}</TableCell>
                <TableCell className="text-right">{formatCount(post.collects)}</TableCell>
                <TableCell className="text-right">{pickRate(post.quality?.completionRate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/** 我的账号表现（创作者数据总线：数据雷达 → 飞书 → AIM），与对标账号形成对比视图。 */
export function OwnAccountSection() {
  const [metrics, setMetrics] = useState<CreatorMetricsResult | null>(null)

  useEffect(() => {
    let cancelled = false
    const end = new Date()
    const start = new Date(end.getTime() - 365 * 24 * 3600 * 1000)
    fetchCreatorMetrics({ start: start.toISOString(), end: end.toISOString() })
      .then((v) => {
        if (!cancelled) setMetrics(v)
      })
      .catch(() => {
        if (!cancelled) setMetrics({ status: "error", message: "读取失败" })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const heading = (
    <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <BarChart3 className="h-4 w-4" />
      我的账号表现
    </h2>
  )

  if (!metrics) {
    return (
      <section className="space-y-3" aria-label="我的账号表现">
        {heading}
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">加载中…</CardContent>
        </Card>
      </section>
    )
  }

  if (metrics.status !== "ok") {
    return (
      <section className="space-y-3" aria-label="我的账号表现">
        {heading}
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {metrics.status === "not_configured"
              ? "尚未配置创作者数据总线（LARK_CREATOR_METRICS_*）。在本机「明动数据雷达」同步后即可展示。"
              : metrics.message}
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section className="space-y-3" aria-label="我的账号表现">
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
      <PlatformTotalsCards totals={metrics.platformTotals} />
      <RecentOwnPosts posts={metrics.posts.slice(0, 8)} />
    </section>
  )
}
