"use client"

import { useState } from "react"
import { Loader2, TrendingUp, Search, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { analyzeChannelsTopic, searchChannelsVideos, type SearchChannelsVideoResult } from "@/lib/api/competitor"

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

  async function handleSearch() {
    const kw = keyword.trim()
    if (!kw) {
      toast.error("请输入选题关键词")
      return
    }
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
    const kw = keyword.trim()
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          视频号选题分析
          <Badge variant="secondary" className="ml-1 text-xs">视频号</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="输入选题关键词，如：供暖节能、老板IP、AI创业"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            disabled={searching || analyzing}
            className="flex-1"
          />
          <Button onClick={() => void handleSearch()} disabled={searching || analyzing || !keyword.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {searching ? "搜索中..." : "搜索"}
          </Button>
          <Button variant="outline" onClick={() => void handleAnalyze()} disabled={analyzing || searching || !keyword.trim()}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? "AI 分析中..." : "AI 选题分析"}
          </Button>
        </div>

        {/* 搜索结果列表 */}
        {searched && videos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">找到 {videos.length} 条相关视频（按热度排序）</p>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {videos.map((video, idx) => (
                <div key={video.videoId ?? idx} className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{video.title || "无标题"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {video.author?.nickname ? <span>@{video.author.nickname}</span> : null}
                      {video.views != null ? <span>播放 {formatNum(video.views)}</span> : null}
                      {video.likes != null ? <span>点赞 {formatNum(video.likes)}</span> : null}
                      {video.comments != null ? <span>评论 {formatNum(video.comments)}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
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
            ) : (
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-foreground/80">
                {typeof analysisResult.analysis === 'string'
                  ? analysisResult.analysis
                  : JSON.stringify(analysisResult.analysis, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
