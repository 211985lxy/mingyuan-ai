"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronLeft, ChevronRight, Copy, Download, History, Loader2, Trash2 } from "lucide-react"
import {
  deleteVoiceHistory,
  fetchVoiceHistory,
  type VoiceHistoryItem,
  type VoiceHistoryPage,
} from "@/lib/api/voice"

const PAGE_SIZE = 5

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false })
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function downloadAudio(item: VoiceHistoryItem) {
  if (!item.audioUrl) return
  const link = document.createElement("a")
  link.href = item.audioUrl
  link.download = `voice-${item.id}.mp3`
  link.click()
}

function HistoryRow({
  item,
  deleting,
  onDeleted,
}: {
  item: VoiceHistoryItem
  deleting: boolean
  onDeleted: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    const text = item.textContent ?? item.textPreview
    if (await copyText(text)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <p className="line-clamp-2 text-sm leading-6" title={item.textContent ?? item.textPreview}>
        {item.textPreview}
        {item.charCount > item.textPreview.length ? "…" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{formatTime(item.createdAt)}</span>
        <span>{item.charCount} 字</span>
        {item.segments > 1 ? <span>分 {item.segments} 段合成</span> : null}
        <span>{item.model}</span>
      </div>
      {item.audioUrl ? (
        <audio controls preload="none" src={item.audioUrl} className="h-9 w-full">
          <track kind="captions" />
        </audio>
      ) : (
        <p className="text-xs text-muted-foreground">音频未转存，可复制全文后重新生成</p>
      )}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void onCopy()}>
          <Copy className="h-3.5 w-3.5" />
          {copied ? "已复制" : "复制全文"}
        </Button>
        {item.audioUrl ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => downloadAudio(item)}>
            <Download className="h-3.5 w-3.5" />
            下载
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          disabled={deleting}
          onClick={() => onDeleted(item.id)}
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          删除
        </Button>
      </div>
    </div>
  )
}

function HistoryPager({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (next: number) => void
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft className="h-3.5 w-3.5" />
        上一页
      </Button>
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        下一页
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

/**
 * 配音历史卡片：工坊页落库的合成记录，支持试听 / 下载 / 复制全文 / 删除。
 * refreshKey 变化时重新加载（父层在每次成功合成后自增）。
 */
export function VoiceHistoryCard({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<VoiceHistoryPage | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const reload = useCallback(async (target: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchVoiceHistory(target, PAGE_SIZE)
      setData(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "历史加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 进页面 / refreshKey 变化时拉一次历史；setState 都在 await 之后，不存在级联渲染
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(page)
  }, [reload, page, refreshKey])

  async function onDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteVoiceHistory(id)
      await reload(page)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败")
    } finally {
      setDeletingId(null)
    }
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          配音历史
          {data ? <span className="text-xs font-normal text-muted-foreground">共 {data.total} 条</span> : null}
        </CardTitle>
        <CardDescription>工坊里勾选落库的合成记录；音频转存 OSS，全文留在系统内。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </p>
        ) : null}
        {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!loading && !error && data?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有记录；生成配音时会自动进入这里。</p>
        ) : null}
        {!loading
          ? (data?.items ?? []).map((item) => (
              <HistoryRow key={item.id} item={item} deleting={deletingId === item.id} onDeleted={(id) => void onDelete(id)} />
            ))
          : null}
        {data && totalPages > 1 ? (
          <HistoryPager page={page} totalPages={totalPages} onPageChange={setPage} />
        ) : null}
      </CardContent>
    </Card>
  )
}
