"use client"

import Link from "next/link"
import { ExternalLink, FileText, Flame, Loader2, Video, Wand2 } from "lucide-react"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { WatchAccount } from "@/lib/api/client"
import { formatCompetitorCount } from "@/lib/competitor/display"
import { buildProxyImageUrl, handleProxyImageError } from "@/lib/proxy-image-client"
import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"
import { getWatchVideoPageUrl } from "@/lib/watch-video-url"
import type { ApiVideoCopyExtraction } from "@/types/api"

const ACTIVE_EXTRACTION_STATUSES = new Set(["queued", "extracting", "analyzing"])

export type CompetitorWatchVideo = NonNullable<WatchAccount["latestVideos"]>[number] & {
  account: WatchAccount
  engagementScore?: number
}

export function isActiveVideoExtractionStatus(status: string) {
  return ACTIVE_EXTRACTION_STATUSES.has(status)
}

function extractionStatusText(record: ApiVideoCopyExtraction | undefined): string {
  if (!record) return "爆款文案拆解"
  if (record.status === "completed" && record.analysisResult) return "查看拆解"
  if (record.status === "completed") return "文案已提取"
  if (record.status === "failed") return "提取失败"
  if (record.status === "analyzing") return "分析中"
  return "提取中"
}

export function getCompetitorVideoPageUrl(video: CompetitorWatchVideo): string {
  return getWatchVideoPageUrl({
    platform: video.account.platform || null,
    videoId: video.videoId || null,
    videoUrl: video.videoUrl || null,
    fallbackUrl: video.account.targetUrl || null,
  })
}

function ExtractionResult({ record }: { record: ApiVideoCopyExtraction }) {
  const analysis = record.analysisResult as { markdown: string } | null
  if (record.status === "failed") return <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600">{record.errorMessage || "文案提取失败"}</p>
  if (!analysis) return null
  return (
    <AiResultPanel title="文案拆解预览" icon={<FileText className="h-3.5 w-3.5 text-primary" />} meta={<span>{record.status === "completed" ? "已完成" : "处理中"}</span>} contentClassName="p-2" className="rounded-lg" flat>
      <p className="mt-1 line-clamp-4 text-muted-foreground">{cleanVideoCopyAnalysisMarkdown(analysis.markdown).slice(0, 200)}...</p>
      {record.transcript ? <p className="mt-2 line-clamp-2 text-muted-foreground">原文案：{record.transcript}</p> : null}
      <div className="mt-2 flex items-center justify-between border-t pt-2 gap-2">
        <Link href="/video-copy" className="text-xs text-primary hover:underline">查看完整记录</Link>
        <Link href={`/aim?agent=content_producer&mode=quick&videoCopyExtractionId=${record.id}`} className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"><Wand2 className="h-3 w-3" />生成内容资产包</Link>
      </div>
    </AiResultPanel>
  )
}

function CompetitorVideoCard({ video, extraction, busy, viral, rank, onExtract }: {
  video: CompetitorWatchVideo
  extraction?: ApiVideoCopyExtraction
  busy: boolean
  viral?: boolean
  rank?: number
  onExtract: () => void
}) {
  return (
    <div className="space-y-2">
      <a href={video.account.targetUrl || getCompetitorVideoPageUrl(video)} target="_blank" rel="noopener noreferrer" className={`group/video relative block aspect-[9/16] rounded-lg overflow-hidden bg-muted ${viral ? "ring-1 ring-orange-300/50" : ""}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-linear-to-b from-muted/30 to-muted-foreground/10 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/50 backdrop-blur-xs text-muted-foreground/60 shadow-xs"><Video className="h-5 w-5" /></span></div>
        <img src={buildProxyImageUrl(video.coverUrl)} alt={video.title || (viral ? "爆款作品" : "作品")} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover/video:scale-105" onError={(event) => handleProxyImageError(event, video.coverUrl || "")} />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-2"><p className="text-xs text-white font-medium line-clamp-1">{video.title || "无标题"}</p><div className="flex items-center gap-2 text-[10px] text-white/70 mt-0.5"><span>赞 {formatCompetitorCount(video.likes)}</span><span>评 {formatCompetitorCount(video.comments)}</span>{viral && video.engagementScore != null ? <span className="text-orange-300">热 {formatCompetitorCount(video.engagementScore)}</span> : null}</div></div>
        <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between"><span className="text-[10px] px-1 py-0.5 rounded bg-black/50 text-white/80 truncate max-w-20 block">{video.account.nickname || ""}</span>{viral ? <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/80 text-white font-bold">TOP {rank ?? "?"}</span> : <ExternalLink className="h-3 w-3 text-white/50 opacity-0 group-hover/video:opacity-100 transition-opacity" />}</div>
      </a>
      <Button size="sm" variant={extraction?.status === "failed" ? "outline" : "secondary"} className="h-8 w-full text-xs" onClick={onExtract} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}{extractionStatusText(extraction)}</Button>
      {extraction ? <ExtractionResult record={extraction} /> : null}
    </div>
  )
}

function VideoSection({ title, videos, viral, extractions, extractingVideoId, onExtract }: {
  title: string
  videos: CompetitorWatchVideo[]
  viral?: boolean
  extractions: Record<string, ApiVideoCopyExtraction>
  extractingVideoId: string | null
  onExtract: (video: CompetitorWatchVideo) => void
}) {
  if (videos.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">{viral ? <Flame className="h-4 w-4 text-orange-500" /> : <Video className="h-4 w-4" />}{title}<Badge variant="secondary" className="text-xs ml-1">{videos.length}</Badge></CardTitle></CardHeader>
      <CardContent><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{videos.map((video, index) => { const key = `${video.account.id}-${video.videoId}`; const extraction = extractions[key]; return <CompetitorVideoCard key={`${viral ? "viral-" : ""}${key}`} video={video} extraction={extraction} busy={extractingVideoId === key || Boolean(extraction && isActiveVideoExtractionStatus(extraction.status))} viral={viral} rank={viral ? index + 1 : undefined} onExtract={() => onExtract(video)} /> })}</div></CardContent>
    </Card>
  )
}

export function CompetitorLatestVideoSection({ latestVideos, extractions, extractingVideoId, onExtract }: {
  latestVideos: CompetitorWatchVideo[]
  extractions: Record<string, ApiVideoCopyExtraction>
  extractingVideoId: string | null
  onExtract: (video: CompetitorWatchVideo) => void
}) {
  return <VideoSection title="当前账号最新作品" videos={latestVideos} extractions={extractions} extractingVideoId={extractingVideoId} onExtract={onExtract} />
}

export function collectAllViralVideos(accounts: WatchAccount[]): CompetitorWatchVideo[] {
  return accounts
    .flatMap((account) => (account.viralVideos ?? []).map((video) => ({ ...video, account })))
    .sort((a, b) => (b.engagementScore ?? 0) - (a.engagementScore ?? 0))
}

export function CompetitorViralVideoPool({ accounts, extractions, extractingVideoId, onExtract }: {
  accounts: WatchAccount[]
  extractions: Record<string, ApiVideoCopyExtraction>
  extractingVideoId: string | null
  onExtract: (video: CompetitorWatchVideo) => void
}) {
  const videos = collectAllViralVideos(accounts)
  if (videos.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="h-4 w-4 text-orange-500" />
            全部对标账号爆款视频
            <Badge variant="secondary" className="text-xs">0</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
            暂无爆款视频。先添加监控账号并刷新作品池，所有账号的爆款视频会统一显示在这里。
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <VideoSection
      title="全部对标账号爆款视频"
      videos={videos}
      viral
      extractions={extractions}
      extractingVideoId={extractingVideoId}
      onExtract={onExtract}
    />
  )
}
