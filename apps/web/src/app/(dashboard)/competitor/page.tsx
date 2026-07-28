"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Film, RefreshCw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { CompetitorAddAccountPanel } from "@/components/competitor/competitor-add-account-panel"
import { CompetitorWebResearchPanel } from "@/components/competitor/competitor-web-research-panel"
import { CompetitorTopicAnalysisPanel } from "@/components/competitor/competitor-topic-analysis-panel"
import { MonitoredAccountGrid } from "@/components/competitor/monitored-account-grid"
import { RecentReportsCard } from "@/components/competitor/recent-reports-card"
import {
  CompetitorViralVideoPool,
  CompetitorLatestVideoSection,
} from "@/components/competitor/competitor-video-sections"
import { toast } from "sonner"
import {
  startCompetitorAnalysis,
} from "@/lib/api/client"
import { sortAccountsByRefreshStatus } from "@/features/competitor/competitor-url-utils"
import {
  resolveActiveAccount,
  resolveActiveLatestVideos,
} from "@/features/competitor/viral-video-pool"
import { CompetitorWorkbenchLinks } from "@/features/competitor/components/competitor-workbench-links"
import { useCompetitorVideoExtractions } from "@/features/competitor/hooks/use-competitor-video-extractions"
import { useCompetitorWebResearch } from "@/features/competitor/hooks/use-competitor-web-research"
import { useCompetitorReports } from "@/features/competitor/hooks/use-competitor-reports"
import { useCompetitorWatchAccounts } from "@/features/competitor/hooks/use-competitor-watch-accounts"

// ─── Main Page ─────────────────────────────────────────

export default function CompetitorWatchPage() {
  const router = useRouter()

  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null)
  const {
    accounts, activeAccountId, addAccount, addUrl, adding,
    deletingId, loading, refreshAccount, refreshAll, refreshing, refreshingId,
    removeAccount, setActiveAccountId, setAddUrl,
  } = useCompetitorWatchAccounts()
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
            onClick={refreshAll}
            disabled={refreshing || hasRefreshingAccount || sortedAccounts.length === 0}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "刷新中..." : "刷新全部"}
          </Button>
        }
      />

      <CompetitorWorkbenchLinks />

      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="accounts"><Users className="h-4 w-4" />监控账号</TabsTrigger>
          <TabsTrigger value="videos"><Film className="h-4 w-4" />作品池</TabsTrigger>
          <TabsTrigger value="reports"><FileText className="h-4 w-4" />分析报告</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-0 space-y-6">
          <CompetitorAddAccountPanel value={addUrl} adding={adding} accountCount={accounts.length} onChange={setAddUrl} onAdd={addAccount} />

          <MonitoredAccountGrid
            accounts={sortedAccounts}
            loading={loading}
            activeAccountId={activeAccountId}
            analyzingUrl={analyzingUrl}
            refreshingId={refreshingId}
            deletingId={deletingId}
            onActivate={setActiveAccountId}
            onAnalyze={(url) => void handleAnalyze(url)}
            onRefresh={(id) => void refreshAccount(id)}
            onDelete={(id) => void removeAccount(id)}
          />

          <CompetitorWebResearchPanel
            activeAccount={activeAccount}
            query={researchQuery}
            loading={researchLoading}
            result={researchResult}
            onQueryChange={setResearchQuery}
            onResearch={research}
          />

          <CompetitorTopicAnalysisPanel />
        </TabsContent>

        <TabsContent value="videos" className="mt-0 space-y-6">
          {loading ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">作品池加载中…</p>
          ) : sortedAccounts.length === 0 ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
              还没有监控账号。先到「监控账号」添加并刷新作品池，爆款视频会统一显示在这里。
            </p>
          ) : (
            <>
              <CompetitorViralVideoPool
                accounts={accounts}
                extractions={videoExtractions}
                extractingVideoId={extractingVideoId}
                onExtract={(video) => void extractVideo(video)}
              />

              <CompetitorLatestVideoSection
                latestVideos={activeLatestVideos}
                extractions={videoExtractions}
                extractingVideoId={extractingVideoId}
                onExtract={(video) => void extractVideo(video)}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="reports" className="mt-0 space-y-6">
          {!loading && sortedAccounts.length > 0 ? (
            <RecentReportsCard reports={reports} loading={reportsLoading} />
          ) : (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
              还没有监控账号。先到「监控账号」添加并刷新，分析报告会出现在这里。
            </p>
          )}
        </TabsContent>

      </Tabs>
    </div>
  )
}
