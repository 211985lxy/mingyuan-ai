"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronRight, Loader2 } from "lucide-react"
import type { LiveReasoningState } from "@/components/aim/thinking-live-reasoning-state"

export type { LiveReasoningState } from "@/components/aim/thinking-live-reasoning-state"
export {
  applyReasoningEvent,
  EMPTY_LIVE_REASONING,
} from "@/components/aim/thinking-live-reasoning-state"

function formatElapsed(startedAt: number, now: number): number {
  if (!startedAt) return 0
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/** 实时思考块：流式展开、结束后折成一行；刷新不留存。 */
export function LiveReasoningBlock({ reasoning }: { reasoning: LiveReasoningState }) {
  const [opened, setOpened] = useState(false)
  const [now, setNow] = useState(reasoning.startedAt || 0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const showCollapsed = reasoning.done && !reasoning.streaming && !opened

  useEffect(() => {
    if (!reasoning.streaming) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [reasoning.streaming, reasoning.startedAt])

  useEffect(() => {
    if (!reasoning.streaming) return
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [reasoning.text, reasoning.streaming])

  if (!reasoning.text && !reasoning.streaming) return null

  const elapsedSec = formatElapsed(reasoning.startedAt, now || reasoning.startedAt)
  const attemptLabel = reasoning.attempt > 1 ? `第 ${reasoning.attempt} 次尝试` : null

  if (showCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setOpened(true)}
        className="mb-2 flex w-full items-center gap-1.5 rounded-md bg-muted/30 px-2 py-1 text-left text-[11px] text-muted-foreground/70"
      >
        <Check className="h-3 w-3 text-emerald-500" />
        <span>思考过程（{elapsedSec} 秒）</span>
        {attemptLabel ? <span className="text-muted-foreground/50">· {attemptLabel}</span> : null}
        <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground/40" />
      </button>
    )
  }

  return (
    <div className="mb-2 rounded-md bg-muted/20 px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        {reasoning.streaming ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        ) : (
          <Check className="h-3 w-3 text-emerald-500" />
        )}
        <span>{reasoning.streaming ? `思考中… ${elapsedSec}s` : "思考过程"}</span>
        {attemptLabel ? <span className="text-muted-foreground/50">· {attemptLabel}</span> : null}
      </div>
      <div
        ref={scrollerRef}
        className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground/80"
      >
        {reasoning.text || "正在思考…"}
      </div>
    </div>
  )
}
