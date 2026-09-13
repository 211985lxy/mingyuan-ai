"use client"

import { useEffect, useState } from "react"

import { OwnAccountSection } from "@/app/(dashboard)/data-platform/own-account-section"
import { RecentVideosTable, type PlatformVideo } from "@/app/(dashboard)/data-platform/recent-videos-table"
import {
  AlertCircle,
  BarChart3,
  DatabaseZap,
  ExternalLink,
  Link2,
  RefreshCw,
} from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DouyinSyncAlert,
  useDouyinSyncAlert,
} from "@/features/integrations/components/douyin-sync-alert"
import { request } from "@/lib/api/client"
import {
  formatDistributionValue,
  toBarRatio,
  type FansDistributionItem,
} from "@/lib/data-platform/fans-distribution"

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
  fansGender?: FansDistributionItem[] | null
  fansAges?: FansDistributionItem[] | null
  fansRegions?: FansDistributionItem[] | null
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

function BindDouyinButton() {
  return (
    <Button
      size="sm"
      onClick={() => {
        window.location.href = `/api/integrations/douyin/auth?return=${encodeURIComponent("/data-platform")}`
      }}
    >
      <Link2 className="mr-2 h-4 w-4" />
      绑定抖音账号
    </Button>
  )
}

/** 指标四联格：分隔线布局，空值显示「暂无」。 */
function MetricGrid({ metrics }: { metrics: Array<{ label: string; value?: number | null }> }) {
  return (
    <div className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4 sm:divide-x sm:divide-border/60">
      {metrics.map((metric) => (
        <div key={metric.label} className="sm:px-3 sm:first:pl-0">
          <div className="text-xs text-muted-foreground">{metric.label}</div>
          <div className="mt-0.5 font-semibold tabular-nums">{formatCount(metric.value)}</div>
        </div>
      ))}
    </div>
  )
}

/** 单条分布：标签 + 归一化条形 + 数值。 */
function DistributionRow({ item, items }: { item: FansDistributionItem; items: FansDistributionItem[] }) {
  const ratio = toBarRatio(item.percent, items)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 truncate text-muted-foreground" title={item.value}>
        {item.value}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right tabular-nums">{formatDistributionValue(item.percent)}</span>
    </div>
  )
}

/**
 * 粉丝画像：性别/年龄/地域分布。
 * 需要抖音「粉丝画像数据」能力（scope fans.data.bind）；未获批时三列均为空，整块不渲染。
 */
function FansProfileBlock({ account }: { account: PlatformAccount }) {
  const groups = [
    { label: "性别", items: account.fansGender },
    { label: "年龄", items: account.fansAges },
    { label: "地域", items: account.fansRegions },
  ].filter((g): g is { label: string; items: FansDistributionItem[] } => Boolean(g.items?.length))
  if (groups.length === 0) return null

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">粉丝画像</p>
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="text-xs text-muted-foreground">{group.label}</p>
          {group.items.map((item) => (
            <DistributionRow key={`${group.label}-${item.value}`} item={item} items={group.items} />
          ))}
        </div>
      ))}
    </div>
  )
}

function AccountCard({ account }: { account: PlatformAccount }) {
  const displayName = account.nickname?.trim() || "未命名账号"
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {displayName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{displayName}</CardTitle>
            <CardDescription className="mt-0.5 truncate">
              {account.platform || "未知平台"}
              {account.accessType ? ` · ${account.accessType}` : ""}
            </CardDescription>
          </div>
          {account.accountStatus ? <Badge variant="secondary">{account.accountStatus}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricGrid
          metrics={[
            { label: "粉丝", value: account.fansCount },
            { label: "获赞收藏", value: account.likeCount },
            { label: "作品", value: account.workCount },
            { label: "关注", value: account.followCount },
          ]}
        />
        <FansProfileBlock account={account} />
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
              查看主页 <ExternalLink className="h-3 w-3" />
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
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-muted-foreground">账号表中暂无数据</p>
            <p className="text-xs text-muted-foreground">
              点上方「绑定抖音账号」扫码同步，或用社媒助手同步达人数据后写入飞书表
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </section>
  )
}

/** 近期作品区（从页面主体拆出，保持函数体 ≤80 行门禁）。 */
function RecentVideosSection({ videos }: { videos: PlatformVideo[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">近期作品（{videos.length}）</h2>
      {videos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-1.5 py-8 text-center">
            <p className="text-sm text-muted-foreground">作品表暂无数据</p>
            <p className="text-xs text-muted-foreground">
              绑定抖音账号后会自动同步作品；其他平台可在社媒助手开启采集并同步飞书
            </p>
          </CardContent>
        </Card>
      ) : (
        <RecentVideosTable videos={videos} />
      )}
    </section>
  )
}

/** 首屏数据未返回时的占位骨架（账号卡 + 作品表两段）。 */
function DataSectionsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        {[0, 1].map((index) => (
          <Card key={index}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 pt-6">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

/** 数据源状态提示（请求失败 / 未配置仓库 / 服务端错误）。 */
function StatusNotices({ errorMsg, data }: { errorMsg: string | null; data: SummaryResponse | null }) {
  return (
    <>
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
    </>
  )
}

export default function DataPlatformPage() {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { okState, errorMsg: bindError } = useDouyinSyncAlert()

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
    // 首屏拉取：同步置 loading 属预期首屏行为（仓库惯例 warn 放行）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  const fetchedAt = data?.status === "ok" ? formatDateTime(data.fetchedAt) : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="多平台数据看板"
        subtitle={
          fetchedAt
            ? `社媒助手同步的账号与作品数据 · 更新于 ${fetchedAt}`
            : "社媒助手同步的账号与作品数据，来自飞书多维表格数据仓库"
        }
      >
        <BindDouyinButton />
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </PageHeader>

      <DouyinSyncAlert okState={okState} errorMsg={bindError} />

      <OwnAccountSection />

      <StatusNotices errorMsg={errorMsg} data={data} />

      {loading && !data && !errorMsg ? <DataSectionsSkeleton /> : null}

      {data?.status === "ok" ? (
        <>
          <AccountsSection accounts={data.accounts} />

          <RecentVideosSection videos={data.recentVideos} />
        </>
      ) : null}
    </div>
  )
}
