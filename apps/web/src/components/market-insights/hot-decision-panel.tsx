"use client"

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, ExternalLink, Loader2, RefreshCcw, Search, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { getHotDecisions, refreshHotDecisions } from "@/lib/api/client"
import type { ApiHotDecisionItem, ApiHotDecisionResponse, ApiHotDecisionSource } from "@/types/api"

const SOURCE_TITLE: Record<ApiHotDecisionSource, string> = {
  aihot: "AI HOT 重点精选",
  market: "全网热榜筛选",
}

const VERDICT_FILTERS = [
  { key: "all", label: "全部" },
  { key: "worth", label: "值得看" },
  { key: "watch", label: "可观察" },
  { key: "caution", label: "谨慎追" },
] as const

/**
 * @description hotdecisionpanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function HotDecisionPanel({ source }: { source: ApiHotDecisionSource }) {
  const [data, setData] = useState<ApiHotDecisionResponse | null>(null)
  const [query, setQuery] = useState("")
  const [verdictFilter, setVerdictFilter] = useState<"all" | "worth" | "watch" | "caution">("all")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setLoading(true)
    setQuery("")
    setVerdictFilter("all")
    getHotDecisions(source)
      .then(setData)
      .catch(() => {
        setData(null)
        toast.error("热点决策暂时不可用")
      })
      .finally(() => setLoading(false))
  }, [source])

  const verdictCounts = useMemo(() => {
    const counts = { all: 0, worth: 0, watch: 0, caution: 0 }
    for (const item of data?.items || []) {
      counts.all++
      if (item.verdict === "worth") counts.worth++
      else if (item.verdict === "watch") counts.watch++
      else if (item.verdict === "caution") counts.caution++
    }
    return counts
  }, [data])

  const items = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return (data?.items || [])
      .filter((item) => verdictFilter === "all" || item.verdict === verdictFilter)
      .filter((item) =>
        !keyword || `${item.title} ${item.summary} ${item.sourceName}`.toLowerCase().includes(keyword),
      )
  }, [data, query, verdictFilter])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const next = await refreshHotDecisions(source)
      setData(next)
      toast.success("热点决策已更新")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新失败")
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-4">
      <AiResultPanel
        title={SOURCE_TITLE[source]}
        icon={<Sparkles className="h-4 w-4 text-primary" />}
        meta={<span>{data?.updatedAt ? `更新时间：${new Date(data.updatedAt).toLocaleString("zh-CN")}` : "等待缓存更新"}</span>}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、来源或摘要"
                className="h-9 pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              刷新
            </Button>
          </div>
        }
      >
        {data?.summary ? <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{data.summary}</p> : null}
        {source === "market" && !loading && (data?.items?.length ?? 0) > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {VERDICT_FILTERS.map((f) => {
              const active = verdictFilter === f.key
              const count = verdictCounts[f.key]
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setVerdictFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {f.label}
                  <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            正在筛选值得看的热点...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            暂无值得推荐的热点。可以刷新，或切换其他榜单。
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item) => <HotDecisionCard key={`${item.source}-${item.id}`} item={item} />)}
          </div>
        )}
      </AiResultPanel>

      {data && data.warnings.length > 0 ? (
        <Card className="border-amber-100 bg-amber-50/[0.3] text-amber-800/90">
          <CardContent className="p-3 text-xs">部分来源未完整覆盖：{data.warnings.join("；")}</CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function HotDecisionCard({ item }: { item: ApiHotDecisionItem }) {
  const aimParams = new URLSearchParams({
    agent: "content_producer",
    mode: "quick",
    topicTitle: item.title,
    topicRationale: [
      item.summary,
      `为什么看：${item.reason}`,
      `怎么用：${item.recommendedAction}`,
      `来源：${item.sourceName}`,
    ].join("\n"),
  })
  const topicPoolParams = new URLSearchParams({
    idea: item.title,
    source: item.sourceName,
    summary: item.summary,
  })

  return (
    <Card className="overflow-hidden border-muted/70">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={verdictClass(item.verdict)}>{item.verdictLabel}</Badge>
          <Badge variant="outline">{item.sourceTierLabel}</Badge>
          {item.isPreselected ? <Badge variant="secondary">已精选</Badge> : null}
          {item.clusterSize > 1 ? <Badge variant="secondary">同事件 {item.clusterSize} 条</Badge> : null}
        </div>

        <div className="space-y-2">
          <h2 className="line-clamp-2 text-base font-semibold leading-snug">{item.title}</h2>
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
          <p><span className="font-medium text-foreground">为什么看：</span>{item.reason}</p>
          <p><span className="font-medium text-foreground">怎么用：</span>{item.recommendedAction}</p>
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t pt-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{item.sourceName}</span>
            <span>{item.sourceConfidence}</span>
            {item.publishedAt ? <span>{new Date(item.publishedAt).toLocaleDateString("zh-CN")}</span> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" nativeButton={false} render={<Link href={`/aim?${aimParams.toString()}`} />}>
              <Sparkles className="h-3.5 w-3.5" />
              AIM 创作
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/aim?mode=quick&agent=work_editor&idea=${encodeURIComponent(item.title)}`} />}>
              <Wand2 className="h-3.5 w-3.5" />
              作品编辑
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/topic-planning?${topicPoolParams.toString()}`} />}>
              加入选题池
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={item.url} target="_blank" rel="noopener noreferrer" />}>
              原文
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function verdictClass(verdict: ApiHotDecisionItem["verdict"]) {
  if (verdict === "worth") return "bg-emerald-600 text-white hover:bg-emerald-600"
  if (verdict === "watch") return "bg-blue-600 text-white hover:bg-blue-600"
  if (verdict === "caution") return "bg-amber-500 text-white hover:bg-amber-500"
  return "bg-muted text-muted-foreground hover:bg-muted"
}
