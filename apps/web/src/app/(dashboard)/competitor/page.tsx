"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { CompetitorAddAccountPanel } from "@/components/competitor/competitor-add-account-panel"
import { CompetitorDiscoveryPanel } from "@/components/competitor/competitor-discovery-panel"
import { CompetitorWebResearchPanel } from "@/components/competitor/competitor-web-research-panel"
import { MonitoredAccountGrid } from "@/components/competitor/monitored-account-grid"
import { RecentReportsCard } from "@/components/competitor/recent-reports-card"
import {
  CompetitorViralVideoPool,
  CompetitorLatestVideoSection,
} from "@/components/competitor/competitor-video-sections"
import { toast } from "sonner"
import { ApiError } from "@/lib/api/client"
import {
  listWatchAccounts,
  addWatchAccount,
  deleteWatchAccount,
  refreshWatchAccounts,
  startCompetitorAnalysis,
  type WatchAccount,
  type SimilarAccount,
} from "@/lib/api/client"
import {
  validateCompetitorUrl,
  sortAccountsByRefreshStatus,
} from "@/features/competitor/competitor-url-utils"
import {
  resolveActiveAccount,
  resolveActiveLatestVideos,
} from "@/features/competitor/viral-video-pool"
import { CompetitorWorkbenchLinks } from "@/features/competitor/components/competitor-workbench-links"
import { useCompetitorVideoExtractions } from "@/features/competitor/hooks/use-competitor-video-extractions"
import { useCompetitorWebResearch } from "@/features/competitor/hooks/use-competitor-web-research"
import { useCompetitorReports } from "@/features/competitor/hooks/use-competitor-reports"
import { useCompetitorDiscovery } from "@/features/competitor/hooks/use-competitor-discovery"
import {
  formatCompetitorRefreshError as formatRefreshError,
} from "@/lib/competitor/display"

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
  const { extractingVideoId, videoExtractions, extractVideo } = useCompetitorVideoExtractions()
  const {
    researchLoading,
    researchQuery,
    researchResult,
    research,
    setResearchQuery,
  } = useCompetitorWebResearch()
  const activeAccount = resolveActiveAccount(accounts, activeAccountId)
  const { loadReports, reports, reportsLoading } = useCompetitorReports(activeAccount?.targetUrl)
  const { discover, discovering, discoveryAttempted, ignoredDiscoveryUrls, ignore, leaderAccounts, peerAccounts } = useCompetitorDiscovery()

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
    if (!addUrl.trim()) return

    const validated = validateCompetitorUrl(addUrl)
    if (!validated.ok) {
      toast.error(validated.error)
      return
    }

    setAdding(true)
    try {
      await addWatchAccount(validated.url)
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

  const sortedAccounts = sortAccountsByRefreshStatus(accounts)

  const activeLatestVideos = resolveActiveLatestVideos(activeAccount)

  const hasRefreshingAccount = accounts.some((account) => account.refreshStatus === "refreshing")

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

      <CompetitorWorkbenchLinks />

      {!loading ? (
        <CompetitorViralVideoPool
          accounts={accounts}
          extractions={videoExtractions}
          extractingVideoId={extractingVideoId}
          onExtract={(video) => void extractVideo(video)}
        />
      ) : null}

          <CompetitorDiscoveryPanel
            activeAccount={activeAccount}
            accounts={accounts}
            discovering={discovering}
            discoveryAttempted={discoveryAttempted}
            peerAccounts={peerAccounts}
            leaderAccounts={leaderAccounts}
            ignoredUrls={ignoredDiscoveryUrls}
            adding={adding}
            refreshingId={refreshingId}
            onActivate={setActiveAccountId}
            onRefresh={handleRefreshOne}
            onDiscover={discover}
            onAdd={handleAddDiscoveredAccount}
            onIgnore={ignore}
          />

          <CompetitorAddAccountPanel value={addUrl} adding={adding} accountCount={accounts.length} onChange={setAddUrl} onAdd={handleAdd} />

          <CompetitorWebResearchPanel
            activeAccount={activeAccount}
            query={researchQuery}
            loading={researchLoading}
            result={researchResult}
            onQueryChange={setResearchQuery}
            onResearch={research}
          />

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

              <CompetitorLatestVideoSection
                latestVideos={activeLatestVideos}
                extractions={videoExtractions}
                extractingVideoId={extractingVideoId}
                onExtract={(video) => void extractVideo(video)}
              />
            </>
          ) : null}
    </div>
  )
}
