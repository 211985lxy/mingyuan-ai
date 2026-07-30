"use client"

import { cn } from "@/lib/utils"
import {
  formatChineseTokenCount,
  type AimContextUsageSegment,
  type AimContextUsageSegmentId,
} from "@/lib/aim-context-usage"

interface AimContextUsageProps {
  usedTokens: number
  maxTokens: number
  segments?: AimContextUsageSegment[]
}

/** 品牌暖色分段：朱砂 / 赤金 / 暖褐 / 沙黄 / 玄石，避免紫靛彩虹 */
const SEGMENT_SWATCH: Record<AimContextUsageSegmentId, string> = {
  conversation: "bg-[oklch(0.575_0.205_28)]",
  current_input: "bg-[oklch(0.68_0.12_75)]",
  pasted_copy: "bg-[oklch(0.55_0.08_55)]",
  images: "bg-[oklch(0.62_0.14_35)]",
  system_reserve: "bg-[oklch(0.45_0.02_60)]",
}

export function AimContextUsage({ usedTokens, maxTokens, segments = [] }: AimContextUsageProps) {
  const safeMax = Math.max(1, maxTokens)
  const percentage = Math.min(100, Math.max(0, Math.round((usedTokens / safeMax) * 100)))
  const remaining = Math.max(0, 100 - percentage)
  const isNearLimit = percentage >= 80
  const visibleSegments = segments.filter((segment) => segment.tokens > 0)

  return (
    <div className="pointer-events-none relative z-20 mx-auto h-0 w-full max-w-6xl xl:max-w-7xl">
      <div className="group pointer-events-auto absolute bottom-2.5 right-12">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label={`背景信息已使用 ${percentage}%`}
        >
          <span
            className={cn(
              "relative h-4.5 w-4.5 rounded-full",
              isNearLimit ? "text-amber-600" : "text-muted-foreground/55",
            )}
            style={{
              background: `conic-gradient(currentColor ${percentage * 3.6}deg, hsl(var(--muted)) 0deg)`,
            }}
          >
            <span className="absolute inset-[3px] rounded-full bg-card" />
          </span>
        </button>

        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-10 right-0 z-30 w-64 translate-y-1 rounded-2xl border border-border/70 bg-popover/98 px-4 py-3 text-popover-foreground opacity-0 shadow-[0_16px_42px_-16px_rgba(37,33,29,0.28)] backdrop-blur-md transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        >
          <p className="text-xs font-medium text-muted-foreground">背景信息窗口</p>

          <div
            className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            {visibleSegments.map((segment) => {
              const width = Math.max(0.5, (segment.tokens / safeMax) * 100)
              return (
                <span
                  key={segment.id}
                  className={cn("h-full shrink-0", SEGMENT_SWATCH[segment.id])}
                  style={{ width: `${Math.min(100, width)}%` }}
                />
              )
            })}
          </div>

          <p className="mt-2.5 text-lg font-semibold tracking-[-0.02em]">
            {percentage}% 已用
            <span className="ml-1 text-sm font-normal text-muted-foreground">（剩余 {remaining}%）</span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            已用 {formatChineseTokenCount(usedTokens)} Token，共 {formatChineseTokenCount(maxTokens)}
          </p>

          {visibleSegments.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5">
              {visibleSegments.map((segment) => (
                <li key={segment.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", SEGMENT_SWATCH[segment.id])}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{segment.label}</span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {formatChineseTokenCount(segment.tokens)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {usedTokens > maxTokens ? (
            <p className="mt-2 border-t border-border/60 pt-2 text-xs leading-5 text-amber-700">
              超出部分会在发送时自动精简。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
