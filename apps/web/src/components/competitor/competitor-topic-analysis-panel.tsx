"use client"

import { useState } from "react"
import { ExternalLink, Loader2, TrendingUp, Search, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { isCompetitorAccountLinkInput } from "@/features/competitor/competitor-url-utils"
import { analyzeChannelsTopic, searchChannelsVideos, type SearchChannelsVideoResult } from "@/lib/api/competitor"

interface TopicAnalysis {
  heat_score?: number
  heat_level?: string
  summary?: string
  analysis?: {
    content_format_distribution?: Array<{ format?: string; percentage?: number }>
    engagement_overview?: {
      avg_views?: number
      avg_likes?: number
      avg_comments?: number
      avg_shares?: number
      top_video_views?: number
    }
    trend_signals?: string[]
    differentiation_opportunities?: string[]
    recommended_angles?: string[]
    risk_notes?: string[]
  }
}

interface TopicAnalysisResult {
  keyword: string
  videosFound: number
  analysis: unknown
  analysisError?: string
}

/**
 * 视频号选题分析面板
 * 关键词搜索 -> 热门视频列表 + AI 选题热度分析报告
 */
export function CompetitorTopicAnalysisPanel() {
  const [keyword, setKeyword] = useState("")
  const [searching, setSearching] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [videos, setVideos] = useState<SearchChannelsVideoResult[]>([])
  const [analysisResult, setAnalysisResult] = useState<TopicAnalysisResult | null>(null)
  const [searched, setSearched] = useState(false)

  function getTopicKeyword(): string | null {
    const kw = keyword.trim()
    if (!kw) {
      toast.error("请输入选题关键词")
      return null
    }
    if (isCompetitorAccountLinkInput(kw)) {
      toast.error("这里分析选题关键词；账号昵称或主页链接请填到下方“添加监控账号”")
      return null
    }
    return kw
  }

  async function handleSearch() {
    const kw = getTopicKeyword()
    if (!kw) return
    setSearching(true)
    setSearched(true)
    setVideos([])
    setAnalysisResult(null)
    try {
      const result = await searchChannelsVideos(kw, { count: 20, sortType: 'popular' })
      setVideos(result.videos ?? [])
      if ((result.videos ?? []).length === 0) {
        toast.info("未找到相关视频，请尝试其他关键词")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "搜索失败，请重试")
    } finally {
      setSearching(false)
    }
  }

  async function handleAnalyze() {
    const kw = getTopicKeyword()
    if (!kw) return
    setAnalyzing(true)
    try {
      const result = await analyzeChannelsTopic(kw, 20)
      setAnalysisResult(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI 分析失败，请重试")
    } finally {
      setAnalyzing(false)
    }
  }

  async function copyVideoId(videoId: string) {
    try {
      await navigator.clipboard.writeText(videoId)
      toast.success("已复制视频 ID")
    } catch {
      toast.error("复制失败，请手动选中 ID")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          视频号选题分析
          <Badge variant="secondary" className="ml-1 text-xs">视频号</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          输入一个选题关键词，查看相关热门作品、竞争热度和可切入的内容角度。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="只输入选题关键词，如：供暖节能、老板IP、AI创业"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            disabled={searching || analyzing}
            className="flex-1"
          />
          <Button onClick={() => void handleSearch()} disabled={searching || analyzing || !keyword.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {searching ? "搜索中..." : "搜索作品"}
          </Button>
          <Button variant="outline" onClick={() => void handleAnalyze()} disabled={analyzing || searching || !keyword.trim()}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? "分析中..." : "生成分析"}
          </Button>
        </div>

        {/* 搜索结果列表 */}
        {searched && videos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">找到 {videos.length} 条相关视频（按热度排序）</p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {videos.map((video, idx) => {
                const openUrl = video.videoUrl?.trim() || ""
                const copyId = video.exportId || video.videoId
                return (
                  <div key={video.videoId ?? idx} className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      {openUrl ? (
                        <a
                          href={openUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 text-sm font-medium text-primary hover:underline"
                        >
                          {video.title || "无标题"}
                        </a>
                      ) : (
                        <p className="line-clamp-2 text-sm font-medium text-foreground/80">{video.title || "无标题"}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {video.author?.nickname ? <span>@{video.author.nickname}</span> : null}
                        {video.views != null ? <span>播放 {formatNum(video.views)}</span> : null}
                        {video.likes != null ? <span>点赞 {formatNum(video.likes)}</span> : null}
                        {video.comments != null ? <span>评论 {formatNum(video.comments)}</span> : null}
                        {openUrl ? (
                          <a
                            href={openUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            打开原视频
                          </a>
                        ) : copyId ? (
                          <button
                            type="button"
                            onClick={() => void copyVideoId(copyId)}
                            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            无可用链接 · 复制 ID
                          </button>
                        ) : (
                          <span>无可用链接</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* AI 分析报告 */}
        {analysisResult && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI 选题热度分析：{analysisResult.keyword}</span>
              <Badge variant="outline">{analysisResult.videosFound} 条样本</Badge>
            </div>
            {analysisResult.analysisError ? (
              <p className="text-xs text-amber-600">{analysisResult.analysisError}</p>
            ) : <TopicAnalysisReport value={analysisResult.analysis} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TopicAnalysisReport({ value }: { value: unknown }) {
  const report = normalizeTopicAnalysis(value)
  if (!report) {
    return <p className="text-sm text-muted-foreground">暂未生成有效分析，请稍后重试。</p>
  }

  const sections = [
    { title: "建议切入角度", items: report.analysis?.recommended_angles ?? [] },
    { title: "差异化机会", items: report.analysis?.differentiation_opportunities ?? [] },
    { title: "趋势信号", items: report.analysis?.trend_signals ?? [] },
  ].filter((section) => section.items.length > 0)
  const engagement = report.analysis?.engagement_overview

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {typeof report.heat_score === "number" ? (
          <Badge>热度 {report.heat_score}/100</Badge>
        ) : null}
        {report.heat_level ? <Badge variant="secondary">{report.heat_level}</Badge> : null}
      </div>

      {report.summary ? (
        <p className="rounded-md bg-muted/40 px-3 py-2 leading-6">{report.summary}</p>
      ) : null}

      {(report.analysis?.content_format_distribution ?? []).length > 0 ? (
        <div>
          <p className="mb-2 font-medium">内容形式分布</p>
          <div className="flex flex-wrap gap-2">
            {report.analysis?.content_format_distribution?.map((item, index) => (
              <Badge key={`${item.format ?? "形式"}-${index}`} variant="outline">
                {item.format || "其他"} {typeof item.percentage === "number" ? `${item.percentage}%` : ""}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {engagement ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Metric label="平均播放" value={engagement.avg_views} />
          <Metric label="平均点赞" value={engagement.avg_likes} />
          <Metric label="平均评论" value={engagement.avg_comments} />
          <Metric label="平均分享" value={engagement.avg_shares} />
          <Metric label="最高播放" value={engagement.top_video_views} />
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {sections.map((section) => (
            <div key={section.title} className="rounded-md border bg-background/60 p-3">
              <p className="mb-2 font-medium">{section.title}</p>
              <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
                {section.items.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {(report.analysis?.risk_notes ?? []).length > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          <span className="font-medium">注意：</span>
          {report.analysis?.risk_notes?.join("；")}
        </div>
      ) : null}
    </div>
  )
}

function normalizeTopicAnalysis(value: unknown): TopicAnalysis | null {
  if (!value) return null
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as TopicAnalysis
    } catch {
      return { summary: value }
    }
  }
  return typeof value === "object" ? value as TopicAnalysis : null
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{typeof value === "number" ? formatNum(value) : "—"}</p>
    </div>
  )
}

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
