"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CompetitorAddAccountPanel } from "@/components/competitor/competitor-add-account-panel"
import { CompetitorTopicAnalysisPanel } from "@/components/competitor/competitor-topic-analysis-panel"
import { MonitoredAccountGrid } from "@/components/competitor/monitored-account-grid"
import { RecentReportsCard } from "@/components/competitor/recent-reports-card"
import {
  CompetitorViralVideoPool,
  CompetitorLatestVideoSection,
} from "@/components/competitor/competitor-video-sections"
import { toast } from "sonner"
import { startCompetitorAnalysis } from "@/lib/api/client"
import { sortAccountsByRefreshStatus } from "@/features/competitor/competitor-url-utils"
import {
  resolveActiveAccount,
  resolveActiveLatestVideos,
} from "@/features/competitor/viral-video-pool"
import { useCompetitorVideoExtractions } from "@/features/competitor/hooks/use-competitor-video-extractions"
import { useCompetitorReports } from "@/features/competitor/hooks/use-competitor-reports"
import { useCompetitorWatchAccounts } from "@/features/competitor/hooks/use-competitor-watch-accounts"

function TopicAnalysisCollapsible() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg bg-muted/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">选题快速分析</span>
          <span className="text-xs text-muted-foreground">输入关键词看竞争热度</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open ? (
        <div className="px-4 pb-4">
          <CompetitorTopicAnalysisPanel />
        </div>
      ) : null}
    </div>
  )
}

function useCompetitorWorkbenchState() {
  const router = useRouter()
  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null)
  const {
    accounts, activeAccountId, addAccount, addUrl, adding,
    deletingId, loading, refreshAccount, refreshAll, refreshing, refreshingId,
    removeAccount, setActiveAccountId, setAddUrl,
  } = useCompetitorWatchAccounts()
  const { extractingVideoId, videoExtractions, extractVideo } = useCompetitorVideoExtractions()
  const activeAccount = resolveActiveAccount(accounts, activeAccountId)
  const { loadReports, reports, reportsLoading } = useCompetitorReports(activeAccount?.targetUrl)

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

  return {
    accounts, activeAccountId, addAccount, addUrl, adding,
    deletingId, loading, refreshAccount, refreshAll, refreshing, refreshingId,
    removeAccount, setActiveAccountId, setAddUrl,
    extractingVideoId, videoExtractions, extractVideo,
    activeAccount, reports, reportsLoading,
    analyzingUrl, handleAnalyze,
  }
}

export function CompetitorWorkbench() {
  const s = useCompetitorWorkbenchState()
  const sortedAccounts = sortAccountsByRefreshStatus(s.accounts)
  const activeLatestVideos = resolveActiveLatestVideos(s.activeAccount)
  const hasRefreshingAccount = s.accounts.some((a) => a.refreshStatus === "refreshing")

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{sortedAccounts.length}/10</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={s.refreshAll}
          disabled={s.refreshing || hasRefreshingAccount || sortedAccounts.length === 0}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${s.refreshing ? "animate-spin" : ""}`} />
          {s.refreshing ? "刷新中..." : "刷新全部"}
        </Button>
      </div>

      <CompetitorAddAccountPanel value={s.addUrl} adding={s.adding} accountCount={s.accounts.length} onChange={s.setAddUrl} onAdd={s.addAccount} />

      <MonitoredAccountGrid
        accounts={sortedAccounts}
        loading={s.loading}
        activeAccountId={s.activeAccountId}
        analyzingUrl={s.analyzingUrl}
        refreshingId={s.refreshingId}
        deletingId={s.deletingId}
        onActivate={s.setActiveAccountId}
        onAnalyze={(url) => void s.handleAnalyze(url)}
        onRefresh={(id) => void s.refreshAccount(id)}
        onDelete={(id) => void s.removeAccount(id)}
      />

      <TopicAnalysisCollapsible />

      {sortedAccounts.length > 0 ? (
        <div className="space-y-5">
          <CompetitorViralVideoPool
            accounts={s.accounts}
            extractions={s.videoExtractions}
            extractingVideoId={s.extractingVideoId}
            onExtract={(video) => void s.extractVideo(video)}
          />
          <CompetitorLatestVideoSection
            latestVideos={activeLatestVideos}
            extractions={s.videoExtractions}
            extractingVideoId={s.extractingVideoId}
            onExtract={(video) => void s.extractVideo(video)}
          />
        </div>
      ) : null}

      {sortedAccounts.length > 0 ? (
        <RecentReportsCard reports={s.reports} loading={s.reportsLoading} />
      ) : null}
    </div>
  )
}
