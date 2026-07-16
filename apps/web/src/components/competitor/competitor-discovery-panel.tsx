"use client"

import { Loader2, RefreshCw, Search } from "lucide-react"

import { DiscoveredAccountCard } from "@/components/competitor/discovered-account-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import type { SimilarAccount, WatchAccount } from "@/lib/api/client"
import { formatCompetitorAccountName, formatCompetitorRelativeTime } from "@/lib/competitor/display"
import { extractPureUrl } from "@/lib/tikhub/url-parser"

interface DiscoveryPanelProps {
  activeAccount?: WatchAccount
  accounts: WatchAccount[]
  discovering: boolean
  discoveryAttempted: boolean
  peerAccounts: SimilarAccount[]
  leaderAccounts: SimilarAccount[]
  ignoredUrls: Set<string>
  adding: boolean
  refreshingId: string | null
  onActivate: (id: string) => void
  onRefresh: (id: string) => Promise<void>
  onDiscover: (url: string) => Promise<void>
  onAdd: (account: SimilarAccount) => Promise<void>
  onIgnore: (key: string) => void
}

function refreshStatusText(account: WatchAccount) {
  if (account.refreshStatus === "refreshing") return "刷新中"
  if (account.refreshStatus === "failed") return "刷新失败"
  if (account.refreshStatus === "success") return "已刷新"
  return "待刷新"
}

function isMonitored(account: SimilarAccount, monitored: WatchAccount[]) {
  if (!account.targetUrl) return false
  const pureUrl = extractPureUrl(account.targetUrl) || account.targetUrl
  return monitored.some((item) => item.targetUrl === pureUrl || item.platformUserId === account.platformUserId)
}

function DiscoveredGroup({ title, description, items, props }: {
  title: string
  description: string
  items: SimilarAccount[]
  props: DiscoveryPanelProps
}) {
  const visible = items.filter((account) => !props.ignoredUrls.has(account.targetUrl || account.platformUserId || account.nickname))
  if (visible.length === 0) return null
  return (
    <div className="space-y-3">
      <div><p className="text-sm font-semibold">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visible.map((account) => {
          const key = account.targetUrl || account.platformUserId || account.nickname
          const monitored = isMonitored(account, props.accounts)
          return (
            <DiscoveredAccountCard
              key={key}
              account={account}
              monitored={monitored}
              canAdd={Boolean(account.targetUrl) && !monitored && props.accounts.length < 10}
              adding={props.adding}
              poolFull={props.accounts.length >= 10}
              onAdd={() => props.onAdd(account)}
              onIgnore={() => props.onIgnore(key)}
            />
          )
        })}
      </div>
    </div>
  )
}

export function CompetitorDiscoveryPanel(props: DiscoveryPanelProps) {
  const account = props.activeAccount
  return (
    <AiResultPanel title="监控对标" icon={<Search className="h-4 w-4 text-primary" />} meta={<span>先监控账号并刷新作品池；自动扩展同赛道是可选增强</span>} flat>
      {account ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={account.id} onChange={(event) => props.onActivate(event.target.value)} disabled={props.discovering} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              {props.accounts.map((item) => <option key={item.id} value={item.id}>{formatCompetitorAccountName(item)}</option>)}
            </select>
            <Button variant="outline" onClick={() => void props.onRefresh(account.id)} disabled={Boolean(props.refreshingId) || account.refreshStatus === "refreshing"}>
              {props.refreshingId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}刷新作品池
            </Button>
            <Button onClick={() => void props.onDiscover(account.targetUrl)} disabled={props.discovering || account.refreshStatus === "refreshing"}>
              {props.discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{props.discovering ? "扩展中..." : "扩展同赛道"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">当前监控：{formatCompetitorAccountName(account)} · {refreshStatusText(account)} · 最近刷新 {formatCompetitorRelativeTime(account.lastRefreshedAt)}</p>
          {props.discovering ? (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-lg" />)}</div>
          ) : props.discoveryAttempted && props.peerAccounts.length + props.leaderAccounts.length === 0 ? (
            <p className="mt-3 rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">当前账号没有可用的自动扩展结果。监控作品池仍可正常刷新；需要加入新账号时，请在下方粘贴抖音主页链接。</p>
          ) : (
            <div className="mt-4 space-y-5">
              <DiscoveredGroup title="近身对标账号" description="适合直接学习选题、钩子、表达方式" items={props.peerAccounts} props={props} />
              <DiscoveredGroup title="头部标杆账号" description="适合观察赛道天花板和成熟账号结构" items={props.leaderAccounts} props={props} />
            </div>
          )}
        </>
      ) : <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">先在下方添加一个抖音主页链接，再刷新作品池。这里不支持直接输入账号名称。</p>}
    </AiResultPanel>
  )
}
