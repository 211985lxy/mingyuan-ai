"use client"

import { AlertCircle, CheckCircle2, Loader2, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
}: {
  segments: string[]
  statuses: SegmentStatus[]
  segmentUrls: (string | null)[]
  busy: boolean
  onRegenerate: (index: number) => void
}) {
  if (segments.length <= 1) return null

  const readyCount = statuses.filter((status) => status === "ready").length

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">分段试听（{segments.length} 段）</h3>
        <p className="text-xs text-muted-foreground">
          {readyCount === segments.length
            ? "某段不满意可单独重生成，不用整篇重跑"
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
}: {
  index: number
  text: string
  status: SegmentStatus
  url: string | null
  busy: boolean
  onRegenerate: () => void
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="space-y-2 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{text}</p>
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
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn("h-7 gap-1 px-2 text-xs")}
            disabled={busy || status === "loading"}
            onClick={onRegenerate}
          >
            <RefreshCcw className="h-3 w-3" />
            {status === "error" ? "重试该段" : "重生成该段"}
          </Button>
        </div>
      </CardContent>
    </Card>
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
