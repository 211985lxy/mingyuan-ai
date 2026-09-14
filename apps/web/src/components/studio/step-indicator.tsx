"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface StudioStep {
  key: string
  label: string
}

/**
 * 顶栏步骤指示器：已完成/当前/待办三态；已完成步骤可点回退。
 * 「一屏一事」——只呈现步骤名，不放任何参数。
 */
export function StepIndicator({
  steps,
  current,
  onStepClick,
}: {
  steps: StudioStep[]
  /** 当前步骤序号，从 1 开始 */
  current: number
  onStepClick?: (step: number) => void
}) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="创作步骤">
      {steps.map((step, index) => {
        const position = index + 1
        const done = position < current
        const active = position === current
        const clickable = done && onStepClick
        return (
          <li key={step.key} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden className="h-px w-4 bg-border sm:w-6" /> : null}
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onStepClick!(position) : undefined}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors",
                active && "bg-primary font-medium text-primary-foreground",
                done && "text-foreground/80 hover:bg-foreground/[0.05]",
                !active && !done && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums",
                  active && "border-primary-foreground/40",
                  done && "border-primary/40 bg-primary/10 text-primary",
                  !active && !done && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : position}
              </span>
              <span>{step.label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
