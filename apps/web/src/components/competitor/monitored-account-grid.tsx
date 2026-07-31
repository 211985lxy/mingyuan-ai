"use client"

import { Clock, ExternalLink, Loader2, RefreshCw, Target, Trash2, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { WatchAccount } from "@/lib/api/client"
import {
  compactCompetitorAccountUrl,
  formatCompetitorAccountName,
  formatCompetitorCount,
  formatCompetitorRefreshError,
  formatCompetitorRelativeTime,
} from "@/lib/competitor/display"
import { buildProxyImageUrl } from "@/lib/proxy-image-client"

function RefreshStatusBadge({ account }: { account: WatchAccount }) {
  if (account.refreshStatus === "refreshing") return <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 animate-pulse">刷新中</Badge>
  if (account.refreshStatus === "failed") return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">失败</Badge>
  if (account.refreshStatus === "success") return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">已刷新</Badge>
  return <Badge variant="outline">待刷新</Badge>
}

function AccountIdentity({ account }: { account: WatchAccount }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {account.avatar ? <img src={buildProxyImageUrl(account.avatar)} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" /> : <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-5 w-5 text-muted-foreground" /></div>}
      <div className="min-w-0">
        <p className="font-semibold text-sm truncate">{formatCompetitorAccountName(account)}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{account.followerCount != null ? `${formatCompetitorCount(account.followerCount)} 粉丝` : "抖音"}</span>
          <RefreshStatusBadge account={account} />
        </div>
      </div>
    </div>
  )
}

function MonitoredAccountCard({ account, active, analyzing, refreshing, deleting, onActivate, onAnalyze, onRefresh, onDelete }: {
  account: WatchAccount
  active: boolean
  analyzing: boolean
  refreshing: boolean
  deleting: boolean
  onActivate: () => void
  onAnalyze: () => void
  onRefresh: () => void
  onDelete: () => void
}) {
  return (
    <Card className={`group relative overflow-hidden cursor-pointer transition-all ${active ? "ring-2 ring-primary/50 bg-primary/[0.02]" : "hover:ring-foreground/20"}`} onClick={onActivate}>
      <CardContent className="p-4">
        <AccountIdentity account={account} />
        <a href={account.targetUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground" title={account.targetUrl} onClick={(event) => event.stopPropagation()}>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{compactCompetitorAccountUrl(account.targetUrl)}</span>
        </a>
        <Button size="sm" variant="outline" className="w-full mt-2.5 text-xs font-semibold border-primary/20 hover:bg-primary/5 hover:text-primary transition-all flex items-center justify-center gap-1.5" onClick={(event) => { event.stopPropagation(); onAnalyze() }} disabled={analyzing}>
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5 text-primary" />}{analyzing ? "启动分析中..." : "AI 深度调查"}
        </Button>
        <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatCompetitorRelativeTime(account.lastRefreshedAt)}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(event) => { event.stopPropagation(); onRefresh() }} disabled={refreshing || account.refreshStatus === "refreshing"} title="刷新该账号"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" disabled={deleting} onClick={(event) => { event.stopPropagation(); onDelete() }} title="移除监控"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        {account.refreshStatus === "failed" && account.refreshError ? <p className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-xs leading-5 text-red-600">{formatCompetitorRefreshError(account.refreshError)}</p> : null}
      </CardContent>
    </Card>
  )
}

interface MonitoredAccountGridProps {
  accounts: WatchAccount[]
  loading: boolean
  activeAccountId: string | null
  analyzingUrl: string | null
  refreshingId: string | null
  deletingId: string | null
  onActivate: (id: string) => void
  onAnalyze: (url: string) => void
  onRefresh: (id: string) => void
  onDelete: (id: string) => void
}

/**
 * @description monitoredaccountgrid
 * @param options - 配置选项
 * @returns 无返回值
 */
export function MonitoredAccountGrid({ accounts, loading, activeAccountId, analyzingUrl, refreshingId, deletingId, onActivate, onAnalyze, onRefresh, onDelete }: MonitoredAccountGridProps) {
  if (loading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, index) => <Card key={index}><CardContent className="p-4"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20 mt-1" /></div></div></CardContent></Card>)}</div>
  if (accounts.length === 0) return <Card><CardContent className="flex flex-col items-center py-16 text-center"><User className="h-12 w-12 text-muted-foreground mb-4" /><h2 className="text-lg font-semibold">还没有监控账号</h2><p className="text-sm text-muted-foreground mt-1">在上方输入抖音优质账号主页链接开始监控</p></CardContent></Card>
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {accounts.map((account) => <MonitoredAccountCard key={account.id} account={account} active={(activeAccountId || accounts[0]?.id) === account.id} analyzing={analyzingUrl === account.targetUrl} refreshing={refreshingId === account.id} deleting={deletingId === account.id} onActivate={() => onActivate(account.id)} onAnalyze={() => onAnalyze(account.targetUrl)} onRefresh={() => onRefresh(account.id)} onDelete={() => onDelete(account.id)} />)}
    </div>
  )
}
