"use client"

import { useState } from "react"
import { Search, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import type { OpportunityItem, OpportunityPlatform } from "../contracts/types"

const PLATFORM_LABELS: Record<OpportunityPlatform, string> = {
  douyin: "抖音",
  wechat_channels: "视频号",
}

export function OpportunitySearchPanel() {
  const [keyword, setKeyword] = useState("")
  const [platforms, setPlatforms] = useState<OpportunityPlatform[]>(["douyin", "wechat_channels"])
  const [sortOrder, setSortOrder] = useState("comprehensive")
  const [timeRange, setTimeRange] = useState("all")
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<OpportunityItem[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function handleSearch() {
    if (!keyword.trim()) {
      toast.error("请输入搜索关键词")
      return
    }

    setLoading(true)
    setItems([])
    setWarnings([])
    setSelected(new Set())

    try {
      const res = await fetch("/api/content-opportunities/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          platforms,
          count: 20,
          filters: {
            sortOrder,
            timeRange: timeRange === "all" ? undefined : timeRange,
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `搜索失败 (${res.status})`)
      }

      const data = await res.json()
      setItems(data.items ?? [])
      setWarnings(data.warnings ?? [])

      if ((data.items ?? []).length === 0) {
        toast.info("未找到相关内容，试试换个关键词")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "搜索失败")
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(sourceId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) {
        next.delete(sourceId)
      } else if (next.size < 10) {
        next.add(sourceId)
      } else {
        toast.warning("最多选择 10 条内容进行研究")
        return prev
      }
      return next
    })
  }

  async function handleSaveCollection() {
    const selectedItems = items.filter((item) => selected.has(item.sourceId))
    if (selectedItems.length === 0) return

    try {
      const res = await fetch("/api/content-opportunities/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${keyword} 研究 (${selectedItems.length}条)`,
          items: selectedItems.map((item) => ({
            platform: item.platform,
            sourceId: item.sourceId,
            sourceUrl: item.sourceUrl,
            title: item.title,
            authorName: item.author.name,
            authorId: item.author.id,
            followerCount: item.author.followerCount,
            publishedAt: item.publishedAt,
            durationSeconds: item.durationSeconds,
            views: item.metrics.views,
            likes: item.metrics.likes,
            comments: item.metrics.comments,
            shares: item.metrics.shares,
            collects: item.metrics.collects,
            opportunityScore: item.opportunityScore,
            scoreConfidence: item.scoreConfidence,
          })),
        }),
      })

      if (!res.ok) throw new Error("保存失败")
      toast.success(`已保存 ${selectedItems.length} 条到研究篮`)
      setSelected(new Set())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败")
    }
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="输入关键词搜索爆款内容..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              搜索
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Select value={sortOrder} onValueChange={(value) => { if (value) setSortOrder(value) }}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comprehensive">综合</SelectItem>
                <SelectItem value="latest">最新</SelectItem>
                <SelectItem value="popular">最热</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={(value) => { if (value) setTimeRange(value) }}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部时间</SelectItem>
                <SelectItem value="24h">24小时</SelectItem>
                <SelectItem value="7d">7天</SelectItem>
                <SelectItem value="30d">30天</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              {(["douyin", "wechat_channels"] as const).map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={platforms.includes(p)}
                    onCheckedChange={(checked) => {
                      setPlatforms((prev) =>
                        checked ? [...prev, p] : prev.filter((x) => x !== p),
                      )
                    }}
                  />
                  {PLATFORM_LABELS[p]}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="flex items-center gap-1.5 text-sm text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Results */}
      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              共 {items.length} 条结果，已选 {selected.size} 条
            </p>
            {selected.size > 0 && (
              <Button size="sm" variant="outline" onClick={handleSaveCollection}>
                保存为研究篮 ({selected.size})
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <Card key={`${item.platform}-${item.sourceId}`} className="transition-colors hover:bg-muted/30">
                <CardContent className="flex items-start gap-3 py-3">
                  <Checkbox
                    checked={selected.has(item.sourceId)}
                    onCheckedChange={() => toggleSelect(item.sourceId)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {PLATFORM_LABELS[item.platform]}
                      </Badge>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline line-clamp-1"
                      >
                        {item.title || "(无标题)"}
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{item.author.name}</span>
                      {item.author.followerCount != null && (
                        <span>粉丝 {formatNum(item.author.followerCount)}</span>
                      )}
                      {item.publishedAt && (
                        <span>{new Date(item.publishedAt).toLocaleDateString("zh-CN")}</span>
                      )}
                      {item.metrics.likes != null && <span>赞 {formatNum(item.metrics.likes)}</span>}
                      {item.metrics.comments != null && <span>评 {formatNum(item.metrics.comments)}</span>}
                      {item.metrics.shares != null && <span>转 {formatNum(item.metrics.shares)}</span>}
                      {item.opportunityScore != null && (
                        <Badge variant="secondary" className="text-xs">
                          机会分 {Math.round(item.opportunityScore * 100)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">输入关键词，搜索抖音和视频号的爆款内容</p>
            <p className="mt-1 text-xs text-muted-foreground">
              支持按时间、热度排序，选择 5-10 条进行 AI 批量研究
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
