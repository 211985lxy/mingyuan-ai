"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  RefreshCw,
  Trash2,
  Plus,
  Clock,
  Video,
  Flame,
  User,
  ExternalLink,
  Target,
  Loader2,
  FileText,
  Bell,
  Wand2,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { toast } from "sonner"
import { ApiError } from "@/lib/api/client"
import {
  listWatchAccounts,
  addWatchAccount,
  deleteWatchAccount,
  refreshWatchAccounts,
  extractWatchAccountVideo,
  recommendWatchAccountVideos,
  discoverSimilarAccounts,
  syncVideoCopyExtraction,
  startCompetitorAnalysis,
  listCompetitorReports,
  runCompetitorWebResearch,
  type WatchAccount,
  type WatchVideoRecommendation,
  type SimilarAccount,
} from "@/lib/api/client"
import { extractPureUrl, checkUrlType } from "@/lib/tikhub/url-parser"
import { shouldOpenDeepCopywriter } from "@/lib/video-copy-routing"
import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import type { ApiCompetitorReport, ApiCompetitorWebResearch, ApiVideoCopyExtraction } from "@/types/api"

// ─── Helpers ────────────────────────────────────────────

const SUPPORTED_DOMAINS = ["douyin.com", "iesdouyin.com", "v.douyin.com"]
const ACTIVE_EXTRACTION_STATUSES = new Set(["queued", "extracting", "analyzing"])

type WatchVideo = NonNullable<WatchAccount["latestVideos"]>[number] & {
  account: WatchAccount
  engagementScore?: number
}

function isSupportedUrl(url: string): boolean {
  return SUPPORTED_DOMAINS.some((domain) => url.includes(domain))
}

function proxyAvatarUrl(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
}

function proxyCoverUrl(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "尚未刷新"
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "刚刚"
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}天前`
  return new Date(iso).toLocaleDateString("zh-CN")
}

function formatDate(iso: string | null): string {
  if (!iso) return "未完成"
  return new Date(iso).toLocaleDateString("zh-CN")
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  return n.toLocaleString("zh-CN")
}

function reportTitle(report: ApiCompetitorReport): string {
  return `${report.accountName || "优质账号"} · 分析报告`
}

function reportStatusLabel(status: ApiCompetitorReport["status"]): string {
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  return "分析中"
}

function formatAccountName(account: WatchAccount): string {
  if (account.nickname) return account.nickname

  try {
    const url = new URL(account.targetUrl)
    const pathParts = url.pathname.split("/").filter(Boolean)
    const tail = pathParts[pathParts.length - 1]
    if (tail) return `抖音账号 · ${tail.slice(0, 12)}`
  } catch {
    // Keep the fallback readable even when a pasted URL is not normalized.
  }

  return "抖音账号（待刷新）"
}

function compactAccountUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const text = `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "")
    return text.length > 46 ? `${text.slice(0, 43)}...` : text
  } catch {
    return url.length > 46 ? `${url.slice(0, 43)}...` : url
  }
}

function formatRefreshError(error: string): string {
  if (error.includes("Timeout") || error.includes("超时")) {
    return "本地浏览器访问抖音超时，账号链接已保存，可以稍后再刷新。"
  }
  if (error.includes("BrowserType.launch") || error.includes("browser")) {
    return "本地浏览器启动失败，账号链接已保存，可以稍后再试。"
  }
  return error.split("\n")[0] || "刷新失败，账号链接已保存。"
}

function videoPageUrl(video: WatchVideo): string {
  return video.videoUrl || `https://www.douyin.com/video/${video.videoId}`
}

function accountPageUrl(video: WatchVideo): string {
  return video.account.targetUrl || videoPageUrl(video)
}

function extractionStatusText(record: ApiVideoCopyExtraction | undefined): string {
  if (!record) return "爆款文案拆解"
  if (record.status === "completed" && record.analysisResult) return "查看拆解"
  if (record.status === "completed") return "文案已提取"
  if (record.status === "failed") return "提取失败"
  if (record.status === "analyzing") return "分析中"
  return "提取中"
}

function refreshStatusBadge(account: WatchAccount) {
  if (account.refreshStatus === "refreshing")
    return <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 animate-pulse">刷新中</Badge>
  if (account.refreshStatus === "failed")
    return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">失败</Badge>
  if (account.refreshStatus === "success")
    return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">已刷新</Badge>
  return <Badge variant="outline">待刷新</Badge>
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
  const [recommendations, setRecommendations] = useState<WatchVideoRecommendation[]>([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [discoverUrl, setDiscoverUrl] = useState("")
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

  const loadRecommendations = useCallback(async () => {
    setRecommendationsLoading(true)
    try {
      const data = await recommendWatchAccountVideos()
      setRecommendations(data.items)
    } catch {
      toast.error("加载推荐视频失败")
    } finally {
      setRecommendationsLoading(false)
    }
  }, [])

  // 初始化加载一次
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccounts()
    void loadRecommendations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!accounts.some((account) => account.refreshStatus === "refreshing")) return

    const timer = window.setInterval(() => {
      void loadAccounts(false)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [accounts, loadAccounts])

  useEffect(() => {
    if (accounts.length === 0 || accounts.some((account) => account.refreshStatus === "refreshing")) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecommendations()
  }, [accounts, loadRecommendations])

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

  async function handleDiscoverSimilar() {
    const trimmed = discoverUrl.trim()
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
        toast.error(msg || err.message)
      } else {
        toast.error(err instanceof Error ? err.message : "发现对标账号失败")
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

  async function handleExtractRecommendation(video: WatchVideoRecommendation) {
    setExtractingVideoId(video.id)
    try {
      const record = await extractWatchAccountVideo({
        watchAccountId: video.watchAccountId,
        videoUrl: video.videoUrl,
        videoTitle: video.title,
        coverUrl: video.coverUrl,
      })
      setVideoExtractions((prev) => ({ ...prev, [video.id]: record }))
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

  function renderExtractionResult(record: ApiVideoCopyExtraction) {
    const analysis = record.analysisResult as { markdown: string } | null
    const rewriteHref = shouldOpenDeepCopywriter(record)
      ? `/aim?agent=deep_copywriter&videoCopyExtractionId=${record.id}`
      : `/aim?agent=content_producer&mode=asset_pack&videoCopyExtractionId=${record.id}`
    if (record.status === "failed") {
      return <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600">{record.errorMessage || "文案提取失败"}</p>
    }
    if (!analysis) return null

    return (
      <AiResultPanel
        title="文案拆解预览"
        icon={<FileText className="h-3.5 w-3.5 text-primary" />}
        meta={<span>{record.status === "completed" ? "已完成" : "处理中"}</span>}
        contentClassName="p-2"
        className="rounded-lg"
        flat
      >
        <p className="mt-1 line-clamp-4 text-muted-foreground">{cleanVideoCopyAnalysisMarkdown(analysis.markdown).slice(0, 200)}...</p>
        {record.transcript ? (
          <p className="mt-2 line-clamp-2 text-muted-foreground">原文案：{record.transcript}</p>
        ) : null}
        <div className="mt-2 flex items-center justify-between border-t pt-2 gap-2">
          <Link href="/video-copy" className="text-xs text-primary hover:underline">
            查看完整记录
          </Link>
          <Link
            href={rewriteHref}
            className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Wand2 className="h-3 w-3" />
            {shouldOpenDeepCopywriter(record) ? "深度改写" : "生成内容资产包"}
          </Link>
        </div>
      </AiResultPanel>
    )
  }

  function renderVideoCard(video: WatchVideo, options: { viral?: boolean; rank?: number } = {}) {
    const key = `${video.account.id}-${video.videoId}`
    const record = videoExtractions[key]
    const isBusy = extractingVideoId === key || (record && ACTIVE_EXTRACTION_STATUSES.has(record.status))

    return (
      <div key={`${options.viral ? "viral-" : ""}${key}`} className="space-y-2">
        <a
          href={accountPageUrl(video)}
          target="_blank"
          rel="noopener noreferrer"
          className={`group/video relative block aspect-[9/16] rounded-lg overflow-hidden bg-muted ${options.viral ? "ring-1 ring-orange-300/50" : ""}`}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-linear-to-b from-muted/30 to-muted-foreground/10 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/50 backdrop-blur-xs text-muted-foreground/60 shadow-xs">
              <Video className="h-5 w-5" />
            </span>
          </div>
          <img
            src={proxyCoverUrl(video.coverUrl)}
            alt={video.title || (options.viral ? "爆款作品" : "作品")}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover/video:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-2">
            <p className="text-xs text-white font-medium line-clamp-1">
              {video.title || "无标题"}
            </p>
            <div className="flex items-center gap-2 text-[10px] text-white/70 mt-0.5">
              <span>赞 {formatCount(video.likes)}</span>
              <span>评 {formatCount(video.comments)}</span>
              {options.viral && video.engagementScore != null ? (
                <span className="text-orange-300">热 {formatCount(video.engagementScore)}</span>
              ) : null}
            </div>
          </div>
          <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between">
            <span className="text-[10px] px-1 py-0.5 rounded bg-black/50 text-white/80 truncate max-w-20 block">
              {video.account.nickname || ""}
            </span>
            {options.viral ? (
              <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/80 text-white font-bold">
                TOP {options.rank ?? "?"}
              </span>
            ) : (
              <ExternalLink className="h-3 w-3 text-white/50 opacity-0 group-hover/video:opacity-100 transition-opacity" />
            )}
          </div>
        </a>
        <Button
          size="sm"
          variant={record?.status === "failed" ? "outline" : "secondary"}
          className="h-8 w-full text-xs"
          onClick={() => handleExtractVideo(video)}
          disabled={Boolean(isBusy)}
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {extractionStatusText(record)}
        </Button>
        {record ? renderExtractionResult(record) : null}
      </div>
    )
  }

  function renderRecommendationCard(video: WatchVideoRecommendation) {
    const record = videoExtractions[video.id]
    const isBusy = extractingVideoId === video.id || (record && ACTIVE_EXTRACTION_STATUSES.has(record.status))

    return (
      <div key={video.id} className="rounded-lg border bg-background p-3">
        <div className="flex gap-3">
          <a
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block h-28 w-20 shrink-0 overflow-hidden rounded-md bg-muted"
          >
            <img
              src={proxyCoverUrl(video.coverUrl)}
              alt={video.title}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-semibold text-white">
              {video.score}
            </span>
          </a>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="shrink-0 text-[10px]">{video.category}</Badge>
              <span className="truncate text-xs text-muted-foreground">{video.accountName}</span>
            </div>
            <a
              href={video.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 line-clamp-2 text-sm font-semibold hover:text-primary"
            >
              {video.title}
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              赞 {formatCount(video.metrics.likes)} · 评 {formatCount(video.metrics.comments)} · 热 {formatCount(video.metrics.engagementScore)}
            </p>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {video.migrationAngle}
            </p>
          </div>
        </div>
        <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
          开头：{video.suggestedHook}
        </p>
        <Button
          size="sm"
          variant={record?.status === "failed" ? "outline" : "secondary"}
          className="mt-2 h-8 w-full text-xs"
          onClick={() => handleExtractRecommendation(video)}
          disabled={Boolean(isBusy)}
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {extractionStatusText(record)}
        </Button>
        {record ? renderExtractionResult(record) : null}
      </div>
    )
  }

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
      <Card key={key} className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {account.avatar ? (
              <img
                src={proxyAvatarUrl(account.avatar)}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{account.nickname || "未知账号"}</p>
                {monitored ? <Badge variant="secondary">已监控</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {account.followerCount ? `${formatCount(account.followerCount)} 粉丝` : "粉丝数未提供"}
                {account.redfoxScore != null ? ` · 红狐指数 ${account.redfoxScore}` : ""}
              </p>
            </div>
          </div>

          {account.reason ? (
            <p className="mt-3 line-clamp-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
              {account.reason}
            </p>
          ) : null}

          {account.recentVideos.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {account.recentVideos.map((video, index) => (
                <a
                  key={`${video.videoUrl}-${index}`}
                  href={video.videoUrl || account.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-muted-foreground hover:text-foreground"
                >
                  {video.title} · 赞 {formatCount(video.likes)} · 评 {formatCount(video.comments)}
                </a>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="h-8 flex-1 text-xs"
              disabled={!canAdd || adding}
              onClick={() => handleAddDiscoveredAccount(account)}
            >
              {monitored ? "已监控" : accounts.length >= 10 ? "账号池已满" : account.targetUrl ? "加入监控" : "无法加入"}
            </Button>
            {account.targetUrl ? (
              <a
                href={account.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                打开主页
              </a>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => {
                setIgnoredDiscoveryUrls((prev) => new Set(prev).add(key))
              }}
            >
              忽略
            </Button>
          </div>
        </CardContent>
      </Card>
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
            title="发现对标账号"
            icon={<Search className="h-4 w-4 text-primary" />}
            meta={<span>粘贴一个抖音账号主页，找同赛道可参考账号</span>}
            flat
          >
            <div className="flex gap-3">
              <Input
                placeholder="https://www.douyin.com/user/..."
                value={discoverUrl}
                onChange={(e) => setDiscoverUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDiscoverSimilar()}
                disabled={discovering}
                className="flex-1"
              />
              <Button
                onClick={handleDiscoverSimilar}
                disabled={discovering || !discoverUrl.trim()}
              >
                {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {discovering ? "发现中..." : "发现对标"}
              </Button>
            </div>
            {discovering ? (
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-lg" />
                ))}
              </div>
            ) : discoveryAttempted && peerAccounts.length + leaderAccounts.length === 0 ? (
              <p className="mt-3 rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                暂未找到可用对标账号，可以换一个更明确的赛道账号
              </p>
            ) : (
              <div className="mt-4 space-y-5">
                {renderDiscoveredGroup("近身对标账号", "适合直接学习选题、钩子、表达方式", peerAccounts)}
                {renderDiscoveredGroup("头部标杆账号", "适合观察赛道天花板和成熟账号结构", leaderAccounts)}
              </div>
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

          {accounts.length > 0 && (
            <AiResultPanel
              title="今日可拍对标视频"
              icon={<Wand2 className="h-4 w-4 text-primary" />}
              meta={<span>从全部监控账号缓存里筛选，优先看匹配度和互动信号</span>}
              flat
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {recommendations.length > 0
                    ? `已推荐 ${recommendations.length} 条，点击可打开原视频或直接做文案拆解。`
                    : "先刷新账号作品池，再生成推荐会更准。"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadRecommendations()}
                  disabled={recommendationsLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${recommendationsLoading ? "animate-spin" : ""}`} />
                  刷新推荐
                </Button>
              </div>
              {recommendationsLoading ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 rounded-lg" />
                  ))}
                </div>
              ) : recommendations.length === 0 ? (
                <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                  暂无可推荐视频。请先添加并刷新监控账号。
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {recommendations.map((video) => renderRecommendationCard(video))}
                </div>
              )}
            </AiResultPanel>
          )}

          {/* Account Cards */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-20 mt-1" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : sortedAccounts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-16 text-center">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <h2 className="text-lg font-semibold">还没有监控账号</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  在上方输入抖音优质账号主页链接开始监控
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Account Pool Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedAccounts.map((account) => (
                  <Card
                    key={account.id}
                    className={`group relative overflow-hidden cursor-pointer transition-all border shadow-sm ${
                      (activeAccountId || (accounts[0] && accounts[0].id)) === account.id
                        ? "ring-2 ring-primary/60 border-primary bg-primary/[0.01] shadow-xs"
                        : "hover:border-primary/50 hover:shadow-md"
                    }`}
                    onClick={() => setActiveAccountId(account.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {account.avatar ? (
                            <img
                              src={proxyAvatarUrl(account.avatar)}
                              alt=""
                              className="h-10 w-10 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <User className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">
                              {formatAccountName(account)}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {account.followerCount != null
                                  ? `${formatCount(account.followerCount)} 粉丝`
                                  : "抖音"}
                              </span>
                              {refreshStatusBadge(account)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <a
                        href={account.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        title={account.targetUrl}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{compactAccountUrl(account.targetUrl)}</span>
                      </a>

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2.5 text-xs font-semibold border-primary/20 hover:bg-primary/5 hover:text-primary transition-all flex items-center justify-center gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAnalyze(account.targetUrl)
                        }}
                        disabled={analyzingUrl === account.targetUrl}
                      >
                        {analyzingUrl === account.targetUrl ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Target className="h-3.5 w-3.5 text-primary" />
                        )}
                        {analyzingUrl === account.targetUrl ? "启动分析中..." : "AI 深度调查"}
                      </Button>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(account.lastRefreshedAt)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRefreshOne(account.id)
                            }}
                            disabled={refreshingId === account.id || account.refreshStatus === "refreshing"}
                            title="刷新该账号"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshingId === account.id ? "animate-spin" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            disabled={deletingId === account.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(account.id)
                            }}
                            title="移除监控"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {account.refreshStatus === "failed" && account.refreshError && (
                        <p className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-xs leading-5 text-red-600">
                          {formatRefreshError(account.refreshError)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" />
                    最近分析报告
                    <Badge variant="secondary" className="text-xs ml-1">{reports.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {reportsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 rounded-lg" />
                      ))}
                    </div>
                  ) : reports.length === 0 ? (
                    <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                      当前账号还没有分析报告。点击该账号的 AI 深度调查后会出现在这里。
                    </p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {reports.map((report) => (
                        <Link
                          key={report.id}
                          href={`/competitor/${report.id}`}
                          className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{reportTitle(report)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              分析于 {formatDate(report.completedAt ?? report.createdAt)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {report.overallScore != null ? (
                              <span className="text-sm font-semibold">{Math.round(report.overallScore)}分</span>
                            ) : null}
                            <Badge variant={report.status === "failed" ? "destructive" : "secondary"}>
                              {reportStatusLabel(report.status)}
                            </Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Latest Videos Section */}
              {activeLatestVideos.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Video className="h-4 w-4" />
                      最新作品
                      <Badge variant="secondary" className="text-xs ml-1">{activeLatestVideos.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {activeLatestVideos.map((video) => renderVideoCard(video))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Viral Videos Section */}
              {activeViralVideos.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Flame className="h-4 w-4 text-orange-500" />
                      爆款作品
                      <Badge variant="secondary" className="text-xs ml-1">{activeViralVideos.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {activeViralVideos.map((video, index) => renderVideoCard(video, { viral: true, rank: index + 1 }))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
    </div>
  )
}
