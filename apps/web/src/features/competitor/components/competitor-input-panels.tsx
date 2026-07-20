import { Loader2, Plus, RefreshCw, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { DiscoveredAccountGroup } from "@/features/competitor/components/discovered-accounts"
import { formatAccountName, formatRelativeTime, refreshStatusText } from "@/features/competitor/presentation"
import type { SimilarAccount, WatchAccount } from "@/lib/api/client"
import type { ApiCompetitorWebResearch } from "@/types/api"

/**
 * @description competitormonitorpanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function CompetitorMonitorPanel({
  accounts,
  activeAccount,
  refreshingId,
  discovering,
  discoveryAttempted,
  peerAccounts,
  leaderAccounts,
  ignoredUrls,
  adding,
  onSelectAccount,
  onRefresh,
  onDiscover,
  onAddDiscovered,
  onIgnore,
}: {
  accounts: WatchAccount[]
  activeAccount?: WatchAccount
  refreshingId: string | null
  discovering: boolean
  discoveryAttempted: boolean
  peerAccounts: SimilarAccount[]
  leaderAccounts: SimilarAccount[]
  ignoredUrls: Set<string>
  adding: boolean
  onSelectAccount: (id: string) => void
  onRefresh: (id: string) => void
  onDiscover: (url: string) => void
  onAddDiscovered: (account: SimilarAccount) => void
  onIgnore: (key: string) => void
}) {
  return (
    <AiResultPanel title="监控对标" icon={<Search className="h-4 w-4 text-primary" />} meta={<span>先监控账号并刷新作品池；自动扩展同赛道是可选增强</span>} flat>
      {activeAccount ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={activeAccount.id} onChange={(event) => onSelectAccount(event.target.value)} disabled={discovering} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              {accounts.map((account) => <option key={account.id} value={account.id}>{formatAccountName(account)}</option>)}
            </select>
            <Button variant="outline" onClick={() => onRefresh(activeAccount.id)} disabled={Boolean(refreshingId) || activeAccount.refreshStatus === "refreshing"}>
              {refreshingId === activeAccount.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}刷新作品池
            </Button>
            <Button onClick={() => onDiscover(activeAccount.targetUrl)} disabled={discovering || activeAccount.refreshStatus === "refreshing"}>
              {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{discovering ? "扩展中..." : "扩展同赛道"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">当前监控：{formatAccountName(activeAccount)} · {refreshStatusText(activeAccount)} · 最近刷新 {formatRelativeTime(activeAccount.lastRefreshedAt)}</p>
          {discovering ? (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-lg" />)}</div>
          ) : discoveryAttempted && peerAccounts.length + leaderAccounts.length === 0 ? (
            <p className="mt-3 rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">当前账号没有可用的自动扩展结果。监控作品池仍可正常刷新；需要加入新账号时，请在下方粘贴抖音主页链接。</p>
          ) : (
            <div className="mt-4 space-y-5">
              <DiscoveredAccountGroup title="近身对标账号" description="适合直接学习选题、钩子、表达方式" items={peerAccounts} accounts={accounts} ignoredUrls={ignoredUrls} adding={adding} onAdd={onAddDiscovered} onIgnore={onIgnore} />
              <DiscoveredAccountGroup title="头部标杆账号" description="适合观察赛道天花板和成熟账号结构" items={leaderAccounts} accounts={accounts} ignoredUrls={ignoredUrls} adding={adding} onAdd={onAddDiscovered} onIgnore={onIgnore} />
            </div>
          )}
        </>
      ) : (
        <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">先在下方添加一个抖音主页链接，再刷新作品池。这里不支持直接输入账号名称。</p>
      )}
    </AiResultPanel>
  )
}

/**
 * @description addcompetitorpanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AddCompetitorPanel({ value, adding, accountCount, onChange, onAdd }: { value: string; adding: boolean; accountCount: number; onChange: (value: string) => void; onAdd: () => void }) {
  return (
    <AiResultPanel title="添加监控账号" icon={<Plus className="h-4 w-4 text-primary" />} meta={<span>粘贴优质账号主页链接，添加后可刷新作品池</span>} flat>
      <div className="flex gap-3">
        <Input placeholder="https://www.douyin.com/user/..." value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAdd()} disabled={adding || accountCount >= 10} className="flex-1" />
        <Button onClick={onAdd} disabled={adding || !value.trim() || accountCount >= 10}>{adding ? "添加中..." : `添加 (${accountCount}/10)`}</Button>
      </div>
      {accountCount >= 10 ? <p className="mt-2 text-xs text-amber-600">已达到 10 个账号上限</p> : null}
    </AiResultPanel>
  )
}

/**
 * @description competitorresearchpanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function CompetitorResearchPanel({ activeAccount, query, loading, result, onQueryChange, onResearch }: { activeAccount?: WatchAccount; query: string; loading: boolean; result: ApiCompetitorWebResearch | null; onQueryChange: (value: string) => void; onResearch: () => void }) {
  return (
    <AiResultPanel title="全网补证" icon={<Search className="h-4 w-4 text-primary" />} meta={<span>使用 agent-reach 的公开 web / RSS 路径，先补真实外部线索</span>} flat>
      <div className="flex flex-col gap-3 lg:flex-row">
        <Input placeholder={activeAccount ? `例如：${formatAccountName(activeAccount)}` : "例如：供暖行业 老板IP / 某个账号名 / 某个细分主题"} value={query} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onResearch()} disabled={loading} className="flex-1" />
        <div className="flex gap-2">
          {activeAccount ? <Button variant="outline" onClick={() => onQueryChange(formatAccountName(activeAccount))} disabled={loading}>带入当前账号</Button> : null}
          <Button onClick={onResearch} disabled={loading || !query.trim()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{loading ? "补证中..." : "开始补证"}</Button>
        </div>
      </div>
      {result ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">检索词：{result.query} · 通道：{result.availability.summary}</div>
          {result.warnings.length > 0 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{result.warnings.join("；")}</p> : null}
          <div className="space-y-2">
            {result.items.map((item) => (
              <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border p-3 transition-colors hover:bg-muted/30">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{item.source}</Badge>{item.publishedAt ? <span>{item.publishedAt}</span> : null}</div>
                <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.snippet || "该结果未返回摘要，可直接打开原文查看。"}</p>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">这里不替你直接下结论，只补公开网页线索。搜到的结果适合反喂给 AI 深度调查和后续选题判断。</p>
      )}
    </AiResultPanel>
  )
}
