"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { cn } from "@/lib/utils"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

const MIN_MESSAGES_FOR_RAIL = 4

interface AimMessageJumpRailProps {
  messages: AimWorkbenchMessage[]
  scrollEl: HTMLElement | null
}

function previewLabel(message: AimWorkbenchMessage): string {
  const raw = message.content.replace(/\s+/g, " ").trim()
  if (!raw) return message.role === "user" ? "你的提问" : "助手回复"
  const prefix = message.role === "user" ? "你：" : "AIM："
  return `${prefix}${raw.slice(0, 28)}${raw.length > 28 ? "…" : ""}`
}

/**
 * 对话右侧消息级跳转轨：一条消息一格，高亮当前可视消息，点击平滑定位。
 */
export function AimMessageJumpRail({ messages, scrollEl }: AimMessageJumpRailProps) {
  const ticks = useMemo(
    () => messages.map((message) => ({ id: message.id, label: previewLabel(message) })),
    [messages],
  )
  const [scrolledId, setScrolledId] = useState<string | null>(null)
  const activeId = useMemo(() => {
    if (ticks.length === 0) return null
    if (scrolledId && ticks.some((tick) => tick.id === scrolledId)) return scrolledId
    return ticks[ticks.length - 1]?.id ?? null
  }, [scrolledId, ticks])

  const syncActiveFromScroll = useCallback(() => {
    if (!scrollEl || ticks.length === 0) return

    const rootTop = scrollEl.getBoundingClientRect().top
    const anchorY = rootTop + Math.min(120, scrollEl.clientHeight * 0.28)
    let bestId = ticks[0]?.id ?? null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const tick of ticks) {
      const el = scrollEl.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(tick.id)}"]`)
      if (!el) continue
      const distance = Math.abs(el.getBoundingClientRect().top - anchorY)
      if (distance < bestDistance) {
        bestDistance = distance
        bestId = tick.id
      }
    }

    if (bestId) setScrolledId(bestId)
  }, [scrollEl, ticks])

  useEffect(() => {
    if (!scrollEl || ticks.length < MIN_MESSAGES_FOR_RAIL) return

    const frame = requestAnimationFrame(() => syncActiveFromScroll())
    scrollEl.addEventListener("scroll", syncActiveFromScroll, { passive: true })
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => syncActiveFromScroll())
    resizeObserver?.observe(scrollEl)

    return () => {
      cancelAnimationFrame(frame)
      scrollEl.removeEventListener("scroll", syncActiveFromScroll)
      resizeObserver?.disconnect()
    }
  }, [scrollEl, syncActiveFromScroll, ticks.length])

  const jumpTo = (id: string) => {
    if (!scrollEl) return
    const el = scrollEl.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`)
    if (!el) return
    setScrolledId(id)
    el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  if (ticks.length < MIN_MESSAGES_FOR_RAIL) return null

  return (
    <nav
      aria-label="消息跳转"
      className="pointer-events-none absolute inset-y-3 right-1 z-10 flex w-5 flex-col items-center justify-center sm:right-2"
    >
      <div className="pointer-events-auto flex h-[min(28rem,calc(100%-0.5rem))] max-h-full w-full flex-col items-center justify-between py-2">
        {ticks.map((tick) => {
          const active = tick.id === activeId
          return (
            <button
              key={tick.id}
              type="button"
              title={tick.label}
              aria-label={`跳转到：${tick.label}`}
              aria-current={active ? "true" : undefined}
              onClick={() => jumpTo(tick.id)}
              className={cn(
                "block shrink-0 rounded-full transition-[width,height,background-color,opacity] duration-150",
                "hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active
                  ? "h-1 w-3.5 bg-primary opacity-100"
                  : "h-0.5 w-2.5 bg-foreground/25 opacity-70 hover:w-3 hover:bg-foreground/45",
              )}
            />
          )
        })}
      </div>
    </nav>
  )
}
