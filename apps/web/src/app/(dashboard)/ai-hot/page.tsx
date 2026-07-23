"use client"

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ExternalLink, Loader2, Newspaper, RefreshCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HotDecisionPanel } from "@/components/market-insights/hot-decision-panel"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import {
  getTodayAiHotBriefing,
  refreshTodayAiHotBriefing,
} from "@/lib/api/client"
import type { ApiAiHotBriefing, ApiAiHotBriefingItem } from "@/types/api"

const CATEGORY_ORDER = [
  "模型发布/更新",
  "产品发布/更新",
  "行业动态",
  "论文研究",
  "技巧与观点",
  "自媒体热榜",
  "客户行业热点",
]

function formatBeijingDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function buildTopicPlanningHref(item: ApiAiHotBriefingItem) {
  const params = new URLSearchParams({
    idea: item.title,
    source: item.source,
    summary: item.summary,
  })
  return `/topic-planning?${params.toString()}`
}

export default function AiHotBriefingPage() {
  const [briefing, setBriefing] = useState<ApiAiHotBriefing | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAccountEmail, setSelectedAccountEmail] = useState("")

  async function loadBriefing(accountEmail = selectedAccountEmail) {
    setError(null)
    try {
      const data = await getTodayAiHotBriefing(accountEmail ? { accountEmail } : undefined)
      setBriefing(data)
      setSelectedAccountEmail(data.accountEmail || accountEmail)
    } catch {
      setError("热点简报暂时不可用，请稍后再试。")
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const data = briefing?.audience === "client_industry"
        ? await getTodayAiHotBriefing(selectedAccountEmail ? { accountEmail: selectedAccountEmail } : undefined)
        : await refreshTodayAiHotBriefing()
      setBriefing(data)
    } catch {
      setError("刷新失败，请稍后再试。")
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadBriefing()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sourceLabel = briefing?.sources?.[0]?.source_name || briefing?.projectName || "当前账号"
  const hasAccountChoices = (briefing?.accounts?.length ?? 0) > 1

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ApiAiHotBriefingItem[]>()
    for (const label of CATEGORY_ORDER) groups.set(label, [])
    for (const item of briefing?.items ?? []) {
      const group = groups.get(item.categoryLabel) ?? []
      group.push(item)
      groups.set(item.categoryLabel, group)
    }
    return CATEGORY_ORDER.map((label) => ({
      label,
      items: groups.get(label) ?? [],
    })).filter((group) => group.items.length > 0)
      .reduce<Array<{ label: string; items: Array<ApiAiHotBriefingItem & { displayIndex: number }> }>>(
        (result, group) => {
          const previousCount = result.reduce((count, entry) => count + entry.items.length, 0)
          result.push({
            label: group.label,
            items: group.items.map((item, index) => ({
              ...item,
              displayIndex: previousCount + index + 1,
            })),
          })
          return result
        },
        []
      )
  }, [briefing])

  if (loading) return <AiHotBriefingSkeleton />

  return (
    <div className="space-y-6 pb-10">
      <WorkbenchHero
        title={briefing?.audience === "client_industry" ? `${sourceLabel}热点` : "全网热点洞察"}
        subtitle={
          briefing?.audience === "client_industry"
            ? "切换账号后自动读取该账号绑定的信源，只展示对应行业线索。"
            : "先看 AI HOT 精选和全网热榜筛选，再进入选题工作台，结合当前账号资料、对标账号、对标文案和资料库生成账号专属选题。热点只做辅助，不直接当最终选题。"
        }
        badge={<Badge variant="secondary">{briefing?.audience === "client_industry" ? "账号信源热点" : "AI HOT + 全网热榜"}</Badge>}
        actions={
          <>
            {hasAccountChoices ? (
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm md:w-[260px]"
                value={selectedAccountEmail}
                onChange={(event) => {
                  const email = event.target.value
                  setSelectedAccountEmail(email)
                  setLoading(true)
                  loadBriefing(email)
                }}
              >
                {(briefing?.accounts ?? []).map((account) => (
                  <option key={account.email} value={account.email}>
                    {account.label}{account.sourceCount > 0 ? ` · ${account.sourceCount} 个信源` : ""}
                  </option>
                ))}
              </select>
            ) : null}
            {briefing ? (
              <p className="text-xs text-muted-foreground">
                {briefing.accountEmail ? `${briefing.accountEmail} · ` : ""}生成时间：{formatBeijingDateTime(briefing.generatedAt)} · 共 {briefing.items.length} 条
              </p>
            ) : null}
            <Button className="w-full md:w-auto" nativeButton={false} render={<Link href="/topic-planning" />}>
              打开选题工作台
            </Button>
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              刷新简报
            </Button>
          </>
        }
      />

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="aihot" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="aihot">AIHOT 精选</TabsTrigger>
          <TabsTrigger value="market">全网热榜洞察</TabsTrigger>
        </TabsList>
        <TabsContent value="aihot" className="mt-0">
          <HotDecisionPanel source="aihot" />
        </TabsContent>
        <TabsContent value="market" className="mt-0">
          <HotDecisionPanel source="market" />
        </TabsContent>
      </Tabs>

      {!briefing || briefing.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
            <Newspaper className="h-9 w-9 opacity-50" />
            <p className="text-sm">今天暂时没有可用线索。也可以直接去选题工作台，基于账号资料和对标素材生成选题。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedItems.map((group) => (
            <AiResultPanel
              key={group.label}
              title={group.label}
              icon={<Newspaper className="h-4 w-4 text-primary" />}
              meta={<span>{group.items.length} 条精选</span>}
              contentClassName="divide-y p-0"
              flat
            >
                {group.items.map((item) => {
                  return (
                    <article key={item.id} className="space-y-2 p-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                          {item.displayIndex}
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="space-y-1">
                            <h2 className="text-sm font-semibold leading-6 text-foreground">
                              {item.title}
                            </h2>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{item.source}</span>
                              <span>{item.timeText}</span>
                            </div>
                          </div>
                          <p className="text-sm leading-6 text-muted-foreground">{item.summary}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              nativeButton={false}
                              render={<Link href={item.url} target="_blank" rel="noreferrer" />}
                            >
                              看原文
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              className="h-8"
                              nativeButton={false}
                              render={<Link href={buildTopicPlanningHref(item)} />}
                            >
                              加入选题池
                            </Button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
            </AiResultPanel>
          ))}
        </div>
      )}
    </div>
  )
}

function AiHotBriefingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 rounded-lg" />
      <Skeleton className="h-72 rounded-lg" />
      <Skeleton className="h-56 rounded-lg" />
    </div>
  )
}
