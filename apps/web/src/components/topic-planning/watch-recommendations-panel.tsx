"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import {
  extractWatchAccountVideo,
  recommendWatchAccountVideos,
  syncVideoCopyExtraction,
  type WatchVideoRecommendation,
} from "@/lib/api/client"
import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import { shouldOpenDeepCopywriter } from "@/lib/video-copy-routing"
import type { ApiVideoCopyExtraction } from "@/types/api"

const ACTIVE_EXTRACTION_STATUSES = new Set(["queued", "extracting", "analyzing"])

function proxyCoverUrl(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  return n.toLocaleString("zh-CN")
}

function extractionStatusText(record: ApiVideoCopyExtraction | undefined): string {
  if (!record) return "爆款文案拆解"
  if (record.status === "completed" && record.analysisResult) return "查看拆解"
  if (record.status === "completed") return "文案已提取"
  if (record.status === "failed") return "提取失败"
  if (record.status === "analyzing") return "分析中"
  return "提取中"
}

export function WatchRecommendationsPanel({ projectId }: { projectId?: string }) {
  const [recommendations, setRecommendations] = useState<WatchVideoRecommendation[]>([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [extractingVideoId, setExtractingVideoId] = useState<string | null>(null)
  const [videoExtractions, setVideoExtractions] = useState<Record<string, ApiVideoCopyExtraction>>({})

  const loadRecommendations = useCallback(async () => {
    setRecommendationsLoading(true)
    try {
      const data = await recommendWatchAccountVideos({
        projectId,
        limit: 6,
      })
      setRecommendations(data.items)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载推荐视频失败")
    } finally {
      setRecommendationsLoading(false)
    }
  }, [projectId])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecommendations()
  }, [loadRecommendations])

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
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
          <Link href="/video-copy" className="text-xs text-primary hover:underline">
            查看完整记录
          </Link>
          <Link
            href={rewriteHref}
            className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="h-3 w-3" />
            {shouldOpenDeepCopywriter(record) ? "深度改写" : "生成内容资产包"}
          </Link>
        </div>
      </AiResultPanel>
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
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <a
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border text-xs font-medium hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            打开原视频
          </a>
          <Button
            size="sm"
            variant={record?.status === "failed" ? "outline" : "secondary"}
            className="h-8 w-full text-xs"
            onClick={() => handleExtractRecommendation(video)}
            disabled={Boolean(isBusy)}
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {extractionStatusText(record)}
          </Button>
        </div>
        {record ? <div className="mt-2">{renderExtractionResult(record)}</div> : null}
      </div>
    )
  }

  return (
    <AiResultPanel
      title="今日可拍对标视频"
      icon={<Sparkles className="h-4 w-4 text-primary" />}
      meta={<span>从全部监控账号缓存里筛选，优先看匹配度和互动信号</span>}
      flat
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {recommendations.length > 0
            ? `已推荐 ${recommendations.length} 条，点击可打开原视频或直接做文案拆解。`
            : "先去竞品研究刷新监控账号作品池，再回来生成今日推荐。"}
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
        <div className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
          暂无可推荐视频。先去
          {" "}
          <Link href="/competitor" className="text-primary hover:underline">
            竞品研究
          </Link>
          {" "}
          添加并刷新监控账号。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {recommendations.map((video) => renderRecommendationCard(video))}
        </div>
      )}
    </AiResultPanel>
  )
}
