"use client"

import { cn } from "@/lib/utils"
import { formatChineseTokenCount } from "@/lib/aim-context-usage"

interface AimContextUsageProps {
  usedTokens: number
  maxTokens: number
}

export function AimContextUsage({ usedTokens, maxTokens }: AimContextUsageProps) {
  const safeMax = Math.max(1, maxTokens)
  const percentage = Math.min(100, Math.max(0, Math.round((usedTokens / safeMax) * 100)))
  const remaining = Math.max(0, 100 - percentage)
  const isNearLimit = percentage >= 80

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
          className="pointer-events-none absolute bottom-10 right-0 z-30 w-56 translate-y-1 rounded-2xl border border-border/70 bg-popover/98 px-4 py-3 text-popover-foreground opacity-0 shadow-[0_16px_42px_-16px_rgba(37,33,29,0.28)] backdrop-blur-md transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        >
          <p className="text-xs font-medium text-muted-foreground">背景信息窗口</p>
          <p className="mt-1 text-lg font-semibold tracking-[-0.02em]">
            {percentage}% 已用
            <span className="ml-1 text-sm font-normal text-muted-foreground">（剩余 {remaining}%）</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            已用 {formatChineseTokenCount(usedTokens)} Token，共 {formatChineseTokenCount(maxTokens)}
          </p>
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
