"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { SegmentStatus } from "@/lib/voice/segment-audio"

/**
 * 分段编辑：逐段试听与单独重生成。
 *
 * 长文最常见的返工是「某一段念错」，这里只重跑那一段——省时间也省合成额度。
 * 单段只有一段时不展示列表（整体试听已覆盖，列出来是噪音）。
 */
export function AudioSegmentEditor({
  segments,
  statuses,
  segmentUrls,
  busy,
  onRegenerate,
  onTextChange,
}: {
  segments: string[]
  statuses: SegmentStatus[]
  segmentUrls: (string | null)[]
  busy: boolean
  onRegenerate: (index: number) => void
  onTextChange: (index: number, text: string) => void
}) {
  if (segments.length <= 1) return null

  const readyCount = statuses.filter((status) => status === "ready").length

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">分段试听（{segments.length} 段）</h3>
        <p className="text-xs text-muted-foreground">
          {readyCount === segments.length
            ? "可直接改某段文字并只重生成该段，不用整篇重跑"
            : `已就绪 ${readyCount}/${segments.length}`}
        </p>
      </div>

      <div className="space-y-2">
        {segments.map((text, index) => (
          <SegmentRow
            key={`${index}-${text.slice(0, 12)}`}
            index={index}
            text={text}
            status={statuses[index] ?? "idle"}
            url={segmentUrls[index] ?? null}
            busy={busy}
            onRegenerate={() => onRegenerate(index)}
            onTextChange={(next) => onTextChange(index, next)}
          />
        ))}
      </div>
    </section>
  )
}

function SegmentRow({
  index,
  text,
  status,
  url,
  busy,
  onRegenerate,
  onTextChange,
}: {
  index: number
  text: string
  status: SegmentStatus
  url: string | null
  busy: boolean
  onRegenerate: () => void
  onTextChange: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  // 文字改动后该段音频已过期，需要重生成才生效
  const stale = draft !== text

  function commit() {
    const next = draft.trim()
    if (next && next !== text) onTextChange(next)
    setEditing(false)
  }

  function cancel() {
    setDraft(text)
    setEditing(false)
  }

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-2 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <SegmentTextBlock
            index={index}
            text={text}
            editing={editing}
            draft={draft}
            onDraftChange={setDraft}
            onStartEdit={() => {
              setDraft(text)
              setEditing(true)
            }}
            onCommit={commit}
            onCancel={cancel}
          />
          <SegmentStatusBadge status={status} />
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-7">
          {url ? (
            <audio controls src={url} className="h-8 max-w-[260px] flex-1" preload="metadata">
              <track kind="captions" />
            </audio>
          ) : (
            <span className="text-xs text-muted-foreground">
              {status === "loading" ? "合成中…" : status === "error" ? "该段未生成" : "待生成"}
            </span>
          )}
          <SegmentActions
            editing={editing}
            stale={stale}
            status={status}
            busy={busy}
            onCommit={commit}
            onCancel={cancel}
            onRegenerate={onRegenerate}
          />
        </div>
      </CardContent>
    </Card>
  )
}

/** 段文字：默认可点击进入编辑，编辑态为 textarea（Esc 取消）。 */
function SegmentTextBlock({
  index,
  text,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  index: number
  text: string
  editing: boolean
  draft: string
  onDraftChange: (value: string) => void
  onStartEdit: () => void
  onCommit: () => void
  onCancel: () => void
}) {
  if (editing) {
    return (
      <Textarea
        value={draft}
        autoFocus
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
        }}
        className="min-h-[64px] flex-1 text-xs leading-5"
        aria-label={`第 ${index + 1} 段文字`}
      />
    )
  }
  return (
    <button
      type="button"
      onClick={onStartEdit}
      className="min-w-0 flex-1 rounded text-left text-xs leading-5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      title="点击修改该段文字"
    >
      {text}
    </button>
  )
}

/** 段操作：编辑态给保存/取消；否则给重生成（文字已改时高亮提示）。 */
function SegmentActions({
  editing,
  stale,
  status,
  busy,
  onCommit,
  onCancel,
  onRegenerate,
}: {
  editing: boolean
  stale: boolean
  status: SegmentStatus
  busy: boolean
  onCommit: () => void
  onCancel: () => void
  onRegenerate: () => void
}) {
  if (editing) {
    return (
      <>
        <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={onCommit}>
          保存文字
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancel}>
          取消
        </Button>
      </>
    )
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn("h-7 gap-1 px-2 text-xs", stale && "text-primary")}
      disabled={busy || status === "loading"}
      onClick={onRegenerate}
    >
      <RefreshCcw className="h-3 w-3" />
      {status === "error" ? "重试该段" : stale ? "重生成该段（文字已改）" : "重生成该段"}
    </Button>
  )
}

function SegmentStatusBadge({ status }: { status: SegmentStatus }) {
  if (status === "loading") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    )
  }
  if (status === "error") {
    return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="合成失败" />
  }
  if (status === "ready") {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="已就绪" />
  }
  return null
}
