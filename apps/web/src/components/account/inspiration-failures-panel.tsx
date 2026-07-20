"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Send } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface FailureItem {
  id: string
  source: string
  content: string
  aiStatus: string
  processingStage: string | null
  errorMessage: string | null
  executionModeSnapshot: string | null
  replyStatus: string | null
  replyErrorMessage: string | null
  externalChatId: string | null
  externalMessageId: string | null
  createdAt: string
  updatedAt: string
  outboxReplies: Array<{ id: string; replyType: string; lastError: string | null; attempts: number; createdAt: string }>
}

interface FailuresResponse {
  items: FailureItem[]
  total: number
  page: number
  limit: number
}

const SOURCE_LABELS: Record<string, string> = {
  feishu: "飞书",
  workbuddy_wechat: "WorkBuddy",
  wecom: "企微",
  text: "手动",
  webhook: "Webhook",
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

/**
 * @description inspirationfailurespanel
 * @returns 无返回值
 */
export function InspirationFailuresPanel() {
  const [data, setData] = useState<FailuresResponse | null>(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  async function reload() {
    setBusy(true)
    try {
      const res = await fetch(`/api/account/inspiration-failures?page=${page}&limit=20`)
      if (!res.ok) throw new Error("请求失败")
      const json: FailuresResponse = await res.json()
      setData(json)
      setSelectedIds(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void reload() }, [page])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function batchAction(action: "reprocess" | "resend") {
    if (selectedIds.size === 0) return toast.error("请先选择任务")
    setBusy(true)
    try {
      const res = await fetch("/api/account/inspiration-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, inspirationIds: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "操作失败")
      }
      const json = await res.json()
      const queued = json.results.filter((r: { status: string }) => r.status === "queued").length
      toast.success(`已入队 ${queued} 个任务`)
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败")
    } finally {
      setBusy(false)
    }
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1
  const hasSelection = selectedIds.size > 0
  const hasDeadLetters = data?.items.some((item) => item.outboxReplies.length > 0) ?? false

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              失败任务
            </CardTitle>
            <CardDescription>查看和处理采集/回复失败的灵感记录</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasSelection && (
              <>
                <Button size="sm" variant="outline" onClick={() => void batchAction("reprocess")} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  重新处理 ({selectedIds.size})
                </Button>
                {hasDeadLetters && (
                  <Button size="sm" variant="outline" onClick={() => void batchAction("resend")} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    重新回复
                  </Button>
                )}
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => void reload()}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无失败任务 🎉</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>共 {data.total} 条</span>
              <span>第 {data.page}/{totalPages} 页</span>
            </div>

            {data.items.map((item) => (
              <div
                key={item.id}
                className={`flex flex-col gap-2 rounded-md border p-3 transition-colors ${
                  selectedIds.has(item.id) ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => toggleSelect(item.id)}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">{SOURCE_LABELS[item.source] || item.source}</Badge>
                    <Badge variant="destructive" className="text-xs">
                      {item.processingStage === "failed" ? item.processingStage : item.aiStatus}
                    </Badge>
                    {item.executionModeSnapshot && item.executionModeSnapshot !== "live" && (
                      <Badge variant="secondary" className="text-xs">{item.executionModeSnapshot}</Badge>
                    )}
                    {item.outboxReplies.length > 0 && (
                      <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">死信 {item.outboxReplies.length}</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(item.updatedAt)}</span>
                </div>
                <p className="line-clamp-1 text-sm text-muted-foreground">{item.content.slice(0, 120)}</p>
                {item.errorMessage && (
                  <p className="truncate text-xs text-destructive/80">{item.errorMessage}</p>
                )}
                {item.replyErrorMessage && item.replyErrorMessage !== item.errorMessage && (
                  <p className="truncate text-xs text-destructive/60">回复失败: {item.replyErrorMessage}</p>
                )}
              </div>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
