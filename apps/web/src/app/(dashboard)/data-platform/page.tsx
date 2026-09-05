"use client"

import { useEffect, useState } from "react"
import { AlertCircle, BarChart3, DatabaseZap, ExternalLink, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { request } from "@/lib/api/client"

type PlatformAccount = {
  id: string
  platform: string
  nickname: string
  avatarUrl?: string | null
  fansCount?: number | null
  followCount?: number | null
  likeCount?: number | null
  workCount?: number | null
  authStatus?: string | null
  accessType?: string | null
  accountStatus?: string | null
  expireAt?: string | null
  homeLink?: string | null
}

type PlatformVideo = {
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

type SummaryResponse =
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string; error?: unknown }
  | { status: "ok"; accounts: PlatformAccount[]; recentVideos: PlatformVideo[]; fetchedAt: string }

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

function AccountCard({ account }: { account: PlatformAccount }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="text-2xl leading-none">{account.platform}</span>
            <span className="truncate">{account.nickname}</span>
          </CardTitle>
          {account.accountStatus ? <Badge variant="secondary">{account.accountStatus}</Badge> : null}
        </div>
        {account.accessType ? (
          <CardDescription>接入方式：{account.accessType}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">粉丝</div>
            <div className="font-medium">{formatCount(account.fansCount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">获赞收藏</div>
            <div className="font-medium">{formatCount(account.likeCount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">作品</div>
            <div className="font-medium">{formatCount(account.workCount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">关注</div>
            <div className="font-medium">{formatCount(account.followCount)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {account.authStatus ? <span>认证：{account.authStatus}</span> : null}
          {account.expireAt ? <span>授权至：{account.expireAt}</span> : null}
          {account.homeLink ? (
            <a
              href={account.homeLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              主页 <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/** 账号总览区（从页面主体拆出，保持函数体 ≤80 行门禁）。 */
function AccountsSection({ accounts }: { accounts: PlatformAccount[] }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <BarChart3 className="h-4 w-4" />
        账号总览（{accounts.length}）
      </h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">账号表中暂无数据，用社媒助手同步达人数据后会出现在这里。</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </section>
  )
}

/** 近期作品表（从页面主体拆出，保持函数体 ≤80 行门禁）。 */
function RecentVideosTable({ videos }: { videos: PlatformVideo[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">近期作品（{videos.length}）</h2>
      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          作品表暂无数据。在社媒助手中开启作品采集并同步飞书后，配置 LARK_PLATFORM_VIDEO_TABLE_ID 即可展示。
        </p>
      ) : (
        <Card>
          <CardContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>作品</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead className="text-right">发布时间</TableHead>
                  <TableHead className="text-right">播放</TableHead>
                  <TableHead className="text-right">点赞</TableHead>
                  <TableHead className="text-right">评论</TableHead>
                  <TableHead className="text-right">收藏</TableHead>
                  <TableHead className="text-right">转发</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((video) => (
                  <TableRow key={video.id}>
                    <TableCell className="max-w-[240px] truncate font-medium">{video.title}</TableCell>
                    <TableCell>{video.platform}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(video.publishedAt)}
                    </TableCell>
                    <TableCell className="text-right">{formatCount(video.playCount)}</TableCell>
                    <TableCell className="text-right">{formatCount(video.likeCount)}</TableCell>
                    <TableCell className="text-right">{formatCount(video.commentCount)}</TableCell>
                    <TableCell className="text-right">{formatCount(video.favoriteCount)}</TableCell>
                    <TableCell className="text-right">{formatCount(video.shareCount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

export default function DataPlatformPage() {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErrorMsg(null)
    try {
      const summary = await request<SummaryResponse>("/api/data-platform/summary")
      setData(summary)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "读取多平台数据失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="多平台数据看板" subtitle="社媒助手同步的账号与作品数据，来自飞书多维表格数据仓库">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </PageHeader>

      {errorMsg ? (
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {errorMsg}
          </CardContent>
        </Card>
      ) : null}

      {data?.status === "not_configured" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseZap className="h-5 w-5" />
              尚未配置数据仓库
            </CardTitle>
            <CardDescription>{data.message}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {data?.status === "error" ? (
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {data.message}
          </CardContent>
        </Card>
      ) : null}

      {data?.status === "ok" ? (
        <>
          <AccountsSection accounts={data.accounts} />

          <RecentVideosTable videos={data.recentVideos} />

          <p className="text-xs text-muted-foreground">数据更新时间：{formatDateTime(data.fetchedAt)}</p>
        </>
      ) : null}
    </div>
  )
}
