"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  RefreshCw,
  Plus,
  ExternalLink,
  Loader2,
  Bell,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { DiscoveredAccountCard } from "@/components/competitor/discovered-account-card"
import { MonitoredAccountGrid } from "@/components/competitor/monitored-account-grid"
import { RecentReportsCard } from "@/components/competitor/recent-reports-card"
import {
  CompetitorVideoSections,
  getCompetitorVideoPageUrl,
  isActiveVideoExtractionStatus,
  type CompetitorWatchVideo,
} from "@/components/competitor/competitor-video-sections"
import { toast } from "sonner"
import { ApiError } from "@/lib/api/client"
import {
  listWatchAccounts,
  addWatchAccount,
  deleteWatchAccount,
  refreshWatchAccounts,
  extractWatchAccountVideo,
  discoverSimilarAccounts,
  syncVideoCopyExtraction,
  startCompetitorAnalysis,
  listCompetitorReports,
  runCompetitorWebResearch,
  type WatchAccount,
  type SimilarAccount,
} from "@/lib/api/client"
import { extractPureUrl, checkUrlType } from "@/lib/tikhub/url-parser"
import {
  formatCompetitorAccountName as formatAccountName,
  formatCompetitorRefreshError as formatRefreshError,
  formatCompetitorRelativeTime as formatRelativeTime,
} from "@/lib/competitor/display"
import type { ApiCompetitorReport, ApiCompetitorWebResearch, ApiVideoCopyExtraction } from "@/types/api"

// ─── Helpers ────────────────────────────────────────────

const SUPPORTED_DOMAINS = ["douyin.com", "iesdouyin.com", "v.douyin.com"]
function isSupportedUrl(url: string): boolean {
  return SUPPORTED_DOMAINS.some((domain) => url.includes(domain))
}

function refreshStatusText(account: WatchAccount) {
  if (account.refreshStatus === "refreshing") return "刷新中"
  if (account.refreshStatus === "failed") return "刷新失败"
  if (account.refreshStatus === "success") return "已刷新"
  return "待刷新"
}

// ─── Main Page ─────────────────────────────────────────

export default function CompetitorWatchPage() {
  const router = useRouter()

  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<WatchAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addUrl, setAddUrl] = useState("")
  const [adding, setAdding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [extractingVideoId, setExtractingVideoId] = useState<string | null>(null)
  const [videoExtractions, setVideoExtractions] = useState<Record<string, ApiVideoCopyExtraction>>({})
  const [reports, setReports] = useState<ApiCompetitorReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryAttempted, setDiscoveryAttempted] = useState(false)
  const [peerAccounts, setPeerAccounts] = useState<SimilarAccount[]>([])
  const [leaderAccounts, setLeaderAccounts] = useState<SimilarAccount[]>([])
  const [ignoredDiscoveryUrls, setIgnoredDiscoveryUrls] = useState<Set<string>>(new Set())
  const [researchQuery, setResearchQuery] = useState("")
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchResult, setResearchResult] = useState<ApiCompetitorWebResearch | null>(null)

  async function handleAnalyze(url: string) {
    setAnalyzingUrl(url)
    try {
      const result = await startCompetitorAnalysis(url)
      void loadReports(url, false)
      toast.success("已成功创建分析任务，正在为您跳转...")
      router.push(`/competitor/${result.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "启动分析失败，请重试")
    } finally {
      setAnalyzingUrl(null)
    }
  }

  const loadReports = useCallback(async (targetUrl: string, showLoading = true) => {
    if (showLoading) setReportsLoading(true)
    try {
      const data = await listCompetitorReports(1, 10, targetUrl)
      setReports(data.items)
    } catch {
      toast.error("加载分析历史失败")
    } finally {
      if (showLoading) setReportsLoading(false)
    }
  }, [])

  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const data = await listWatchAccounts()
      setAccounts(data.items)
      if (data.items.length > 0) {
        setActiveAccountId((prev) => {
          const exists = data.items.some((a) => a.id === prev)
          return exists ? prev : data.items[0].id
        })
      } else {
        setActiveAccountId(null)
      }
    } catch {
      toast.error("加载监控列表失败")
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  // 初始化加载一次
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!accounts.some((account) => account.refreshStatus === "refreshing")) return

    const timer = window.setInterval(() => {
      void loadAccounts(false)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [accounts, loadAccounts])

  async function handleAdd() {
    const trimmed = addUrl.trim()
    if (!trimmed) return

    if (!isSupportedUrl(trimmed)) {
      toast.error("第一版暂时只支持抖音主页链接")
      return
    }
    const typeError = checkUrlType(trimmed)
    if (typeError) {
      toast.error(typeError)
      return
    }

    const pureUrl = extractPureUrl(trimmed)
    if (!pureUrl) {
      toast.error("链接格式不正确")
      return
    }

    setAdding(true)
    try {
      await addWatchAccount(pureUrl)
      toast.success("已添加监控账号")
      setAddUrl("")
      await loadAccounts()
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = err.details ? String((err.details as Record<string, unknown>).error || "") : ""
        toast.error(msg || "添加失败")
      } else {
        toast.error("添加失败")
      }
    } finally {
      setAdding(false)
    }
  }

  async function handleDiscoverSimilar(targetUrl: string) {
    const trimmed = targetUrl.trim()
    if (!trimmed) {
      toast.error("先选择一个已监控账号")
      return
    }

    if (!isSupportedUrl(trimmed)) {
      toast.error("第一版暂时只支持抖音主页链接")
      return
    }
    const typeError = checkUrlType(trimmed)
    if (typeError) {
      toast.error(typeError)
      return
    }

    const pureUrl = extractPureUrl(trimmed)
    if (!pureUrl) {
      toast.error("链接格式不正确")
      return
    }

    setDiscovering(true)
    setDiscoveryAttempted(true)
    try {
      const result = await discoverSimilarAccounts(pureUrl)
      setPeerAccounts(result.peerAccounts)
      setLeaderAccounts(result.leaderAccounts)
      setIgnoredDiscoveryUrls(new Set())
      if (result.peerAccounts.length + result.leaderAccounts.length === 0) {
        toast.info("暂未找到可用对标账号，可以换一个更明确的赛道账号")
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = err.details ? String((err.details as Record<string, unknown>).error || "") : ""
        toast.error(msg || "当前账号暂时无法自动扩展同赛道，监控和作品池不受影响")
      } else {
        toast.error("当前账号暂时无法自动扩展同赛道，监控和作品池不受影响")
      }
    } finally {
      setDiscovering(false)
    }
  }

  async function handleAddDiscoveredAccount(account: SimilarAccount) {
    if (!account.targetUrl) return
    setAdding(true)
    try {
      await addWatchAccount(account.targetUrl)
      toast.success("已加入监控，刷新后可进入作品池和 AIM 选题依据")
      await loadAccounts()
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = err.details ? String((err.details as Record<string, unknown>).error || "") : ""
        toast.error(msg || "添加失败")
      } else {
        toast.error("添加失败")
      }
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return
    setDeletingId(id)
    try {
      await deleteWatchAccount(id)
      setAccounts((prev) => prev.filter((a) => a.id !== id))
      setActiveAccountId((prev) => {
        if (prev === id) {
          const remaining = accounts.filter((a) => a.id !== id)
          return remaining.length > 0 ? remaining[0].id : null
        }
        return prev
      })
      toast.success("已移除监控账号")
    } catch {
      toast.error("移除失败")
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRefreshAll() {
    setRefreshing(true)
    try {
      const result = await refreshWatchAccounts()
      if (result.summary.failed > 0) {
        const firstError = result.results.find((item) => item.status === "failed")?.error
        toast.error(firstError ? formatRefreshError(firstError) : `刷新失败: ${result.summary.failed}/${result.summary.total}`)
      } else {
        toast.success(`已开始刷新 ${result.summary.total} 个账号`)
      }
      await loadAccounts(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "刷新失败")
    } finally {
      setRefreshing(false)
    }
  }

  async function handleRefreshOne(accountId: string) {
    setRefreshingId(accountId)
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, refreshStatus: "refreshing" } : a)),
    )
    try {
      const result = await refreshWatchAccounts(accountId)
      await loadAccounts(false)
      const failed = result.results.find((item) => item.status === "failed")
      if (failed) {
        toast.error(failed.error ? formatRefreshError(failed.error) : "刷新失败，账号链接已保存。")
      } else {
        toast.success("已开始后台刷新")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "刷新失败")
      await loadAccounts()
    } finally {
      setRefreshingId(null)
    }
  }

  async function handleExtractVideo(video: CompetitorWatchVideo) {
    const key = `${video.account.id}-${video.videoId}`
    setExtractingVideoId(key)
    try {
      const record = await extractWatchAccountVideo({
        watchAccountId: video.account.id,
        videoUrl: getCompetitorVideoPageUrl(video),
        videoTitle: video.title,
        coverUrl: video.coverUrl,
      })
      setVideoExtractions((prev) => ({ ...prev, [key]: record }))
      if (record.status === "failed") {
        toast.error(record.errorMessage || "文案提取失败")
      } else {
        toast.success("已创建文案拆解任务")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建文案拆解任务失败")
    } finally {
      setExtractingVideoId(null)
    }
  }

  useEffect(() => {
    const active = Object.entries(videoExtractions).find(([, record]) =>
      isActiveVideoExtractionStatus(record.status),
    )
    if (!active) return

    const [key, record] = active
    const timer = window.setTimeout(() => {
      syncVideoCopyExtraction(record.id)
        .then((next) => {
          setVideoExtractions((prev) => ({ ...prev, [key]: next }))
        })
        .catch(() => {})
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [videoExtractions])

  const sortedAccounts = [...accounts].sort((a, b) => {
    const order: Record<string, number> = { refreshing: 0, idle: 1, failed: 2, success: 3 }
    return (order[a.refreshStatus] ?? 9) - (order[b.refreshStatus] ?? 9)
  })

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0]

  useEffect(() => {
    if (!activeAccount?.targetUrl) return
    void loadReports(activeAccount.targetUrl)
  }, [activeAccount?.targetUrl, loadReports])

  const activeLatestVideos = activeAccount && activeAccount.latestVideos
    ? (activeAccount.latestVideos || [])
        .map((v) => ({ ...v, account: activeAccount }))
        .sort((a, b) => b.createTime - a.createTime)
        .slice(0, 30)
    : []

  const activeViralVideos = activeAccount && activeAccount.viralVideos
    ? (activeAccount.viralVideos || [])
        .map((v) => ({ ...v, account: activeAccount }))
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .slice(0, 20)
    : []

  const hasRefreshingAccount = accounts.some((account) => account.refreshStatus === "refreshing")


  function isDiscoveredAccountMonitored(account: SimilarAccount) {
    if (!account.targetUrl) return false
    const pureUrl = extractPureUrl(account.targetUrl) || account.targetUrl
    return accounts.some((a) => a.targetUrl === pureUrl || a.platformUserId === account.platformUserId)
  }

  function visibleDiscoveredAccounts(items: SimilarAccount[]) {
    return items.filter((account) => !ignoredDiscoveryUrls.has(account.targetUrl || account.platformUserId || account.nickname))
  }

  async function handleWebResearch() {
    const query = researchQuery.trim()
    if (!query) {
      toast.error("先输入一个要补证的关键词")
      return
    }

    setResearchLoading(true)
    try {
      const result = await runCompetitorWebResearch(query)
      setResearchResult(result)
      if (result.warnings.length > 0) {
        toast.warning(result.warnings[0])
      } else {
        toast.success(`已补到 ${result.items.length} 条公开线索`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "全网补证失败")
    } finally {
      setResearchLoading(false)
    }
  }

  function renderDiscoveredAccount(account: SimilarAccount) {
    const key = account.targetUrl || account.platformUserId || account.nickname
    const monitored = isDiscoveredAccountMonitored(account)
    const canAdd = Boolean(account.targetUrl) && !monitored && accounts.length < 10
    return (
      <DiscoveredAccountCard
        key={key}
        account={account}
        monitored={monitored}
        canAdd={canAdd}
        adding={adding}
        poolFull={accounts.length >= 10}
        onAdd={() => handleAddDiscoveredAccount(account)}
        onIgnore={() => setIgnoredDiscoveryUrls((previous) => new Set(previous).add(key))}
      />
    )
  }

  function renderDiscoveredGroup(title: string, description: string, items: SimilarAccount[]) {
    const visible = visibleDiscoveredAccounts(items)
    if (visible.length === 0) return null

    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map((account) => renderDiscoveredAccount(account))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <WorkbenchHero
        title="竞品研究"
        subtitle="监控核心对标账号，刷新作品池和爆款作品，沉淀可复用的内容证据。"
        badge={
          <Badge variant="secondary">
            {sortedAccounts.length}/10 个监控账号
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshing || hasRefreshingAccount || sortedAccounts.length === 0}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "刷新中..." : "刷新全部"}
          </Button>
        }
      />

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          <Card className="border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-foreground">优质账号分析</p>
                <p className="mt-1 text-xs text-muted-foreground">监控优质账号，刷新作品池和爆款作品。</p>
            </div>
            <Badge>当前</Badge>
          </CardContent>
        </Card>

          <Link href="/video-copy" className="block">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-foreground">爆款文案拆解</p>
                <p className="mt-1 text-xs text-muted-foreground">粘贴视频链接，提取文案并做结构化分析。</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

        <Link href="/ai-hot" className="block">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-foreground">全网热点洞察</p>
                <p className="mt-1 text-xs text-muted-foreground">去那里查看 AIHOT 精选、全网热榜洞察和当天线索。</p>
              </div>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

          <AiResultPanel
            title="监控对标"
            icon={<Search className="h-4 w-4 text-primary" />}
            meta={<span>先监控账号并刷新作品池；自动扩展同赛道是可选增强</span>}
            flat
          >
            {activeAccount ? (
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={activeAccount.id}
                    onChange={(event) => setActiveAccountId(event.target.value)}
                    disabled={discovering}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{formatAccountName(account)}</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    onClick={() => void handleRefreshOne(activeAccount.id)}
                    disabled={Boolean(refreshingId) || activeAccount.refreshStatus === "refreshing"}
                  >
                    {refreshingId === activeAccount.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    刷新作品池
                  </Button>
                  <Button
                    onClick={() => void handleDiscoverSimilar(activeAccount.targetUrl)}
                    disabled={discovering || activeAccount.refreshStatus === "refreshing"}
                  >
                    {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {discovering ? "扩展中..." : "扩展同赛道"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  当前监控：{formatAccountName(activeAccount)} · {refreshStatusText(activeAccount)} · 最近刷新 {formatRelativeTime(activeAccount.lastRefreshedAt)}
                </p>
                {discovering ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-36 rounded-lg" />
                    ))}
                  </div>
                ) : discoveryAttempted && peerAccounts.length + leaderAccounts.length === 0 ? (
                  <p className="mt-3 rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                    当前账号没有可用的自动扩展结果。监控作品池仍可正常刷新；需要加入新账号时，请在下方粘贴抖音主页链接。
                  </p>
                ) : (
                  <div className="mt-4 space-y-5">
                    {renderDiscoveredGroup("近身对标账号", "适合直接学习选题、钩子、表达方式", peerAccounts)}
                    {renderDiscoveredGroup("头部标杆账号", "适合观察赛道天花板和成熟账号结构", leaderAccounts)}
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                先在下方添加一个抖音主页链接，再刷新作品池。这里不支持直接输入账号名称。
              </p>
            )}
          </AiResultPanel>

          {/* Add Account Card */}
          <AiResultPanel
            title="添加监控账号"
            icon={<Plus className="h-4 w-4 text-primary" />}
            meta={<span>粘贴优质账号主页链接，添加后可刷新作品池</span>}
            flat
          >
            <div className="flex gap-3">
              <Input
                placeholder="https://www.douyin.com/user/..."
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                disabled={adding || accounts.length >= 10}
                className="flex-1"
              />
              <Button
                onClick={handleAdd}
                disabled={adding || !addUrl.trim() || accounts.length >= 10}
              >
                {adding ? "添加中..." : `添加 (${accounts.length}/10)`}
              </Button>
            </div>
            {accounts.length >= 10 && (
              <p className="text-xs text-amber-600 mt-2">已达到 10 个账号上限</p>
            )}
          </AiResultPanel>

          <AiResultPanel
            title="全网补证"
            icon={<Search className="h-4 w-4 text-primary" />}
            meta={<span>使用 agent-reach 的公开 web / RSS 路径，先补真实外部线索</span>}
            flat
          >
            <div className="flex flex-col gap-3 lg:flex-row">
              <Input
                placeholder={activeAccount ? `例如：${formatAccountName(activeAccount)}` : "例如：供暖行业 老板IP / 某个账号名 / 某个细分主题"}
                value={researchQuery}
                onChange={(e) => setResearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleWebResearch()}
                disabled={researchLoading}
                className="flex-1"
              />
              <div className="flex gap-2">
                {activeAccount ? (
                  <Button
                    variant="outline"
                    onClick={() => setResearchQuery(formatAccountName(activeAccount))}
                    disabled={researchLoading}
                  >
                    带入当前账号
                  </Button>
                ) : null}
                <Button
                  onClick={() => void handleWebResearch()}
                  disabled={researchLoading || !researchQuery.trim()}
                >
                  {researchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {researchLoading ? "补证中..." : "开始补证"}
                </Button>
              </div>
            </div>

            {researchResult ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  检索词：{researchResult.query} · 通道：{researchResult.availability.summary}
                </div>
                {researchResult.warnings.length > 0 ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {researchResult.warnings.join("；")}
                  </p>
                ) : null}
                <div className="space-y-2">
                  {researchResult.items.map((item) => (
                    <a
                      key={item.url}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border p-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{item.source}</Badge>
                        {item.publishedAt ? <span>{item.publishedAt}</span> : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.snippet || "该结果未返回摘要，可直接打开原文查看。"}</p>
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                这里不替你直接下结论，只补公开网页线索。搜到的结果适合反喂给 AI 深度调查和后续选题判断。
              </p>
            )}
          </AiResultPanel>

          <MonitoredAccountGrid
            accounts={sortedAccounts}
            loading={loading}
            activeAccountId={activeAccountId}
            analyzingUrl={analyzingUrl}
            refreshingId={refreshingId}
            deletingId={deletingId}
            onActivate={setActiveAccountId}
            onAnalyze={(url) => void handleAnalyze(url)}
            onRefresh={(id) => void handleRefreshOne(id)}
            onDelete={(id) => void handleDelete(id)}
          />

          {!loading && sortedAccounts.length > 0 ? (
            <>

              <RecentReportsCard reports={reports} loading={reportsLoading} />

              <CompetitorVideoSections
                latestVideos={activeLatestVideos}
                viralVideos={activeViralVideos}
                extractions={videoExtractions}
                extractingVideoId={extractingVideoId}
                onExtract={(video) => void handleExtractVideo(video)}
              />
            </>
          ) : null}
    </div>
  )
}
