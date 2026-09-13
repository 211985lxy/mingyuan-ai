"use client"

import { Clapperboard } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** 社媒作品明细（来自飞书多维表格数据仓库）。 */
export type PlatformVideo = {
  id: string
  platform: string
  title: string
  coverUrl?: string | null
  publishedAt?: string | null
  playCount?: number | null
  likeCount?: number | null
  commentCount?: number | null
  favoriteCount?: number | null
  shareCount?: number | null
  completionRate?: number | null
  tags?: string[] | null
  aimSuggestion?: string | null
  trafficSource?: string | null
}

function formatCount(value?: number | null): string {
  if (value == null) return "—"
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`
  return value.toLocaleString("zh-CN")
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN", { hour12: false })
}

/** 表格里的短日期：只留月-日，完整时间放 title。 */
function formatShortDate(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
}

/** 作品封面：无图时用主色渐变占位，避免一排灰块。 */
function VideoCover({ url, title }: { url?: string | null; title: string }) {
  return (
    <div className="relative h-10 w-[72px] shrink-0 overflow-hidden rounded border bg-muted">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- 封面为飞书外链，未配 next/image 远端白名单
        <img src={url} alt={title} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
          <Clapperboard className="h-3.5 w-3.5 text-primary/50" />
        </div>
      )}
    </div>
  )
}

/** 标题 + 封面 + 话题标签：作品列的完整单元格。 */
function VideoTitleCell({ video }: { video: PlatformVideo }) {
  const tags = video.tags?.filter(Boolean).slice(0, 3) ?? []
  return (
    <div className="flex max-w-[380px] items-center gap-2.5">
      <VideoCover url={video.coverUrl} title={video.title} />
      <div className="min-w-0">
        <p className="truncate font-medium" title={video.title}>
          {video.title}
        </p>
        {tags.length > 0 ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {tags.map((tag) => `#${tag}`).join(" ")}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** 完播率：迷你进度条 + 百分比（上游可能存 0-1 小数或百分数）。 */
function CompletionRateCell({ rate }: { rate: number | null }) {
  if (rate == null || Number.isNaN(rate)) {
    return <span className="text-muted-foreground">—</span>
  }
  const ratio = Math.min(100, Math.round((rate > 1 ? rate / 100 : rate) * 100))
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${ratio}%` }} />
      </div>
      <span className="tabular-nums">{ratio}%</span>
    </div>
  )
}

/** 作品明细表。 */
export function RecentVideosTable({ videos }: { videos: PlatformVideo[] }) {
  return (
    <Card>
      <CardContent className="pt-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>作品</TableHead>
              <TableHead>平台</TableHead>
              <TableHead className="text-right">发布</TableHead>
              <TableHead className="text-right">播放</TableHead>
              <TableHead className="text-right">点赞</TableHead>
              <TableHead className="text-right">评论</TableHead>
              <TableHead className="text-right">收藏</TableHead>
              <TableHead className="text-right">转发</TableHead>
              <TableHead className="text-right">完播率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {videos.map((video) => (
              <TableRow key={video.id}>
                <TableCell>
                  <VideoTitleCell video={video} />
                </TableCell>
                <TableCell>
                  {video.platform ? (
                    <Badge variant="outline" className="px-1.5 text-xs font-normal">
                      {video.platform}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell
                  className="text-right text-muted-foreground"
                  title={formatDateTime(video.publishedAt)}
                >
                  {formatShortDate(video.publishedAt)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCount(video.playCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(video.likeCount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(video.commentCount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(video.favoriteCount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(video.shareCount)}</TableCell>
                <TableCell className="text-right">
                  <CompletionRateCell rate={video.completionRate ?? null} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
