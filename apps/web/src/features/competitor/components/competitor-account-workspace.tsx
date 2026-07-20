import Link from "next/link"
import { Clock, ExternalLink, FileText, Flame, Loader2, RefreshCw, Target, Trash2, User, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CompetitorVideoCard } from "@/features/competitor/components/competitor-video-card"
import { compactAccountUrl, formatAccountName, formatCount, formatDate, formatRefreshError, formatRelativeTime, reportStatusLabel, reportTitle, type WatchVideo } from "@/features/competitor/presentation"
import { buildProxyImageUrl } from "@/lib/proxy-image-client"
import type { WatchAccount } from "@/lib/api/client"
import type { ApiCompetitorReport, ApiVideoCopyExtraction } from "@/types/api"

function RefreshStatusBadge({ account }: { account: WatchAccount }) {
  if (account.refreshStatus === "refreshing") return <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-700 animate-pulse">刷新中</Badge>
  if (account.refreshStatus === "failed") return <Badge variant="outline" className="border-red-200 bg-red-100 text-red-700">失败</Badge>
  if (account.refreshStatus === "success") return <Badge variant="outline" className="border-green-200 bg-green-100 text-green-700">已刷新</Badge>
  return <Badge variant="outline">待刷新</Badge>
}

const PLATFORM_LABELS: Record<string, string> = { douyin: '抖音', wechat_channels: '视频号', xiaohongshu: '小红书', bilibili: 'B站', kuaishou: '快手' }
function PlatformBadge({ platform }: { platform?: string }) {
  const label = PLATFORM_LABELS[platform ?? ''] ?? null
  if (!label) return null
  return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[10px] px-1 py-0">{label}</Badge>
}

/**
 * @description competitoraccountworkspace
 * @param options - 配置选项
 * @returns 无返回值
 */
export function CompetitorAccountWorkspace({
  loading,
  accounts,
  activeAccountId,
  analyzingUrl,
  refreshingId,
  deletingId,
  reports,
  reportsLoading,
  latestVideos,
  viralVideos,
  videoExtractions,
  extractingVideoId,
  onSelectAccount,
  onAnalyze,
  onRefresh,
  onDelete,
  onExtract,
}: {
  loading: boolean
  accounts: WatchAccount[]
  activeAccountId: string | null
  analyzingUrl: string | null
  refreshingId: string | null
  deletingId: string | null
  reports: ApiCompetitorReport[]
  reportsLoading: boolean
  latestVideos: WatchVideo[]
  viralVideos: WatchVideo[]
  videoExtractions: Record<string, ApiVideoCopyExtraction>
  extractingVideoId: string | null
  onSelectAccount: (id: string) => void
  onAnalyze: (url: string) => void
  onRefresh: (id: string) => void
  onDelete: (id: string) => void
  onExtract: (video: WatchVideo) => void
}) {
  if (loading) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Card key={index}><CardContent className="p-4"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-28" /><Skeleton className="mt-1 h-3 w-20" /></div></div></CardContent></Card>)}</div>
  }
  if (accounts.length === 0) {
    return <Card><CardContent className="flex flex-col items-center py-16 text-center"><User className="mb-4 h-12 w-12 text-muted-foreground" /><h2 className="text-lg font-semibold">还没有监控账号</h2><p className="mt-1 text-sm text-muted-foreground">在上方输入抖音/视频号优质账号主页链接开始监控</p></CardContent></Card>
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id} className={`group relative cursor-pointer overflow-hidden border shadow-sm transition-all ${activeAccountId === account.id ? "border-primary bg-primary/[0.01] shadow-xs ring-2 ring-primary/60" : "hover:border-primary/50 hover:shadow-md"}`} onClick={() => onSelectAccount(account.id)}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {account.avatar ? <img src={buildProxyImageUrl(account.avatar)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"><User className="h-5 w-5 text-muted-foreground" /></div>}
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{formatAccountName(account)}</p><div className="mt-0.5 flex items-center gap-2"><PlatformBadge platform={account.platform} /><span className="text-xs text-muted-foreground">{account.followerCount != null ? `${formatCount(account.followerCount)} 粉丝` : ""}</span><RefreshStatusBadge account={account} /></div></div>
              </div>
              <a href={account.targetUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground" title={account.targetUrl} onClick={(event) => event.stopPropagation()}><ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{compactAccountUrl(account.targetUrl)}</span></a>
              <Button size="sm" variant="outline" className="mt-2.5 flex w-full items-center justify-center gap-1.5 border-primary/20 text-xs font-semibold transition-all hover:bg-primary/5 hover:text-primary" onClick={(event) => { event.stopPropagation(); onAnalyze(account.targetUrl) }} disabled={analyzingUrl === account.targetUrl}>
                {analyzingUrl === account.targetUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5 text-primary" />}{analyzingUrl === account.targetUrl ? "启动分析中..." : "AI 深度调查"}
              </Button>
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRelativeTime(account.lastRefreshedAt)}</span><div className="flex items-center gap-1"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(event) => { event.stopPropagation(); onRefresh(account.id) }} disabled={refreshingId === account.id || account.refreshStatus === "refreshing"} title="刷新该账号"><RefreshCw className={`h-3.5 w-3.5 ${refreshingId === account.id ? "animate-spin" : ""}`} /></Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" disabled={deletingId === account.id} onClick={(event) => { event.stopPropagation(); onDelete(account.id) }} title="移除监控"><Trash2 className="h-3.5 w-3.5" /></Button></div></div>
              {account.refreshStatus === "failed" && account.refreshError ? <p className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-xs leading-5 text-red-600">{formatRefreshError(account.refreshError)}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />最近分析报告<Badge variant="secondary" className="ml-1 text-xs">{reports.length}</Badge></CardTitle></CardHeader>
        <CardContent>
          {reportsLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)}</div> : reports.length === 0 ? <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">当前账号还没有分析报告。点击该账号的 AI 深度调查后会出现在这里。</p> : <div className="divide-y rounded-lg border">{reports.map((report) => <Link key={report.id} href={`/competitor/${report.id}`} className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{reportTitle(report)}</p><p className="mt-0.5 text-xs text-muted-foreground">分析于 {formatDate(report.completedAt ?? report.createdAt)}</p></div><div className="flex shrink-0 items-center gap-2">{report.overallScore != null ? <span className="text-sm font-semibold">{Math.round(report.overallScore)}分</span> : null}<Badge variant={report.status === "failed" ? "destructive" : "secondary"}>{reportStatusLabel(report.status)}</Badge></div></Link>)}</div>}
        </CardContent>
      </Card>
      <VideoSection title="最新作品" icon={<Video className="h-4 w-4" />} videos={latestVideos} videoExtractions={videoExtractions} extractingVideoId={extractingVideoId} onExtract={onExtract} />
      <VideoSection title="爆款作品" icon={<Flame className="h-4 w-4 text-orange-500" />} videos={viralVideos} videoExtractions={videoExtractions} extractingVideoId={extractingVideoId} onExtract={onExtract} viral />
    </>
  )
}

function VideoSection({ title, icon, videos, videoExtractions, extractingVideoId, onExtract, viral = false }: { title: string; icon: React.ReactNode; videos: WatchVideo[]; videoExtractions: Record<string, ApiVideoCopyExtraction>; extractingVideoId: string | null; onExtract: (video: WatchVideo) => void; viral?: boolean }) {
  if (videos.length === 0) return null
  return <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">{icon}{title}<Badge variant="secondary" className="ml-1 text-xs">{videos.length}</Badge></CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{videos.map((video, index) => { const key = `${video.account.id}-${video.videoId}`; return <CompetitorVideoCard key={viral ? `viral-${key}` : key} video={video} extraction={videoExtractions[key]} extractingVideoId={extractingVideoId} viral={viral} rank={viral ? index + 1 : undefined} onExtract={onExtract} /> })}</div></CardContent></Card>
}
