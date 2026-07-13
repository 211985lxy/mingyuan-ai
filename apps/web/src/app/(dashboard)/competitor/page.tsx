"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, ExternalLink, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { CompetitorAccountWorkspace } from "@/features/competitor/components/competitor-account-workspace"
import { AddCompetitorPanel, CompetitorMonitorPanel, CompetitorResearchPanel } from "@/features/competitor/components/competitor-input-panels"
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
  formatRefreshError,
  isSupportedCompetitorUrl,
  videoPageUrl,
  type WatchVideo,
} from "@/features/competitor/presentation"
import type { ApiCompetitorReport, ApiCompetitorWebResearch, ApiVideoCopyExtraction } from "@/types/api"

const ACTIVE_EXTRACTION_STATUSES = new Set(["queued", "extracting", "analyzing"])

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

    if (!isSupportedCompetitorUrl(trimmed)) {
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

    if (!isSupportedCompetitorUrl(trimmed)) {
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

  async function handleExtractVideo(video: WatchVideo) {
    const key = `${video.account.id}-${video.videoId}`
    setExtractingVideoId(key)
    try {
      const record = await extractWatchAccountVideo({
        watchAccountId: video.account.id,
        videoUrl: videoPageUrl(video),
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
      ACTIVE_EXTRACTION_STATUSES.has(record.status),
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

          <CompetitorMonitorPanel
            accounts={accounts}
            activeAccount={activeAccount}
            refreshingId={refreshingId}
            discovering={discovering}
            discoveryAttempted={discoveryAttempted}
            peerAccounts={peerAccounts}
            leaderAccounts={leaderAccounts}
            ignoredUrls={ignoredDiscoveryUrls}
            adding={adding}
            onSelectAccount={setActiveAccountId}
            onRefresh={handleRefreshOne}
            onDiscover={handleDiscoverSimilar}
            onAddDiscovered={handleAddDiscoveredAccount}
            onIgnore={(key) => setIgnoredDiscoveryUrls((previous) => new Set(previous).add(key))}
          />

          <AddCompetitorPanel
            value={addUrl}
            adding={adding}
            accountCount={accounts.length}
            onChange={setAddUrl}
            onAdd={handleAdd}
          />

          <CompetitorResearchPanel
            activeAccount={activeAccount}
            query={researchQuery}
            loading={researchLoading}
            result={researchResult}
            onQueryChange={setResearchQuery}
            onResearch={handleWebResearch}
          />

          <CompetitorAccountWorkspace
            loading={loading}
            accounts={sortedAccounts}
            activeAccountId={activeAccountId || accounts[0]?.id || null}
            analyzingUrl={analyzingUrl}
            refreshingId={refreshingId}
            deletingId={deletingId}
            reports={reports}
            reportsLoading={reportsLoading}
            latestVideos={activeLatestVideos}
            viralVideos={activeViralVideos}
            videoExtractions={videoExtractions}
            extractingVideoId={extractingVideoId}
            onSelectAccount={setActiveAccountId}
            onAnalyze={handleAnalyze}
            onRefresh={handleRefreshOne}
            onDelete={handleDelete}
            onExtract={handleExtractVideo}
          />
    </div>
  )
}
