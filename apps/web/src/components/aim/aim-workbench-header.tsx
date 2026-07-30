"use client"

import { Check, Plus } from "lucide-react"
import type { ComponentType } from "react"

import { Button } from "@/components/ui/button"
import type { AimWorkflowStage } from "@/lib/aim-workflow"
import { AIM_WORKFLOW_STAGES } from "@/lib/aim-workflow"
import { cn } from "@/lib/utils"

export interface AimWorkbenchHeaderProps {
  workflowStage: AimWorkflowStage
  agentTitle: string
  AgentIcon: ComponentType<{ className?: string }>
  /** 空状态（未开始任务）时不展示完整四阶段步骤条，避免与正文快捷入口重复 */
  showStageProgress: boolean
  /** @deprecated 阶段条改为只读进度，不再用于切换专家 */
  onStageChange?: (stage: AimWorkflowStage) => void
  onReset: () => void
}

/**
 * 紧凑单行头：阶段只读进度 + 当前专家名 + 新任务。
 * 从 aim-workbench-chrome.tsx 拆出以控制函数行数 ≤80。
 */
export function AimWorkbenchHeader({
  workflowStage,
  agentTitle,
  AgentIcon,
  showStageProgress,
  onReset,
}: AimWorkbenchHeaderProps) {
  const currentIndex = AIM_WORKFLOW_STAGES.findIndex(
    (stage) => stage.id === workflowStage,
  )
  const currentStageTitle =
    AIM_WORKFLOW_STAGES.find((stage) => stage.id === workflowStage)?.title ??
    agentTitle

  return (
    <header className="relative z-30 flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-background/60 px-2 py-1.5 backdrop-blur-sm md:gap-2.5 md:px-4">
      <span
        className="hidden size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-amber-500/10 text-primary ring-1 ring-inset ring-primary/15 sm:inline-flex"
        title={agentTitle}
      >
        <AgentIcon className="size-4" />
      </span>

      {showStageProgress ? (
        <>
          <p className="shrink-0 text-xs font-medium leading-none text-foreground md:hidden">
            {currentStageTitle}
          </p>
          <nav
            className="hidden min-w-0 flex-1 items-center md:flex"
            aria-label="AIM 工作流进度"
          >
            <ol className="flex min-w-0 items-center gap-1">
              {AIM_WORKFLOW_STAGES.map((stage, index) => (
                <StageItem
                  key={stage.id}
                  stage={stage}
                  index={index}
                  currentIndex={currentIndex}
                />
              ))}
            </ol>
          </nav>
          <span className="min-w-0 flex-1 md:hidden" aria-hidden />
        </>
      ) : (
        <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-none tracking-tight text-foreground">
          {agentTitle}
        </p>
      )}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 rounded-lg px-2.5 text-[12px] font-medium leading-none transition-colors hover:bg-primary/8 hover:text-primary"
        onClick={onReset}
      >
        <Plus className="size-4" strokeWidth={2.2} />
        新任务
      </Button>
    </header>
  )
}

function StageItem(props: {
  stage: (typeof AIM_WORKFLOW_STAGES)[number]
  index: number
  currentIndex: number
}) {
  const { stage, index, currentIndex } = props
  const isCurrent = stage.id === (AIM_WORKFLOW_STAGES[currentIndex]?.id ?? null)
  const isDone = index < currentIndex
  const isNext = index === currentIndex + 1
  return (
    <li className="flex items-center">
      <span
        title={stage.description}
        aria-current={isCurrent ? "step" : undefined}
        className={cn(
          "relative inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[12px] font-medium leading-none transition-all duration-200",
          isCurrent &&
            "bg-gradient-to-r from-primary/15 via-primary/10 to-amber-500/10 text-primary shadow-[0_0_0_1px_rgba(209,74,51,0.18),0_2px_8px_-4px_rgba(209,74,51,0.25)]",
          isDone && "text-muted-foreground/85",
          !isCurrent && !isDone && "text-muted-foreground/60",
        )}
      >
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none tabular-nums transition-all",
            isCurrent &&
              "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-[0_0_0_2px_var(--background),0_0_0_3px_rgba(209,74,51,0.2)]",
            isDone &&
              "bg-gradient-to-br from-emerald-500/80 to-emerald-600/80 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.2)]",
            !isCurrent &&
              !isDone &&
              "border border-dashed border-muted-foreground/35 text-muted-foreground/60 bg-muted/40",
          )}
        >
          {isDone ? (
            <Check className="size-3" strokeWidth={3} aria-hidden />
          ) : isCurrent ? (
            <span className="leading-none">{index + 1}</span>
          ) : (
            <span className="leading-none opacity-80">{index + 1}</span>
          )}
        </span>
        <span
          className={cn(
            "leading-none",
            isCurrent && "font-semibold tracking-tight",
            isNext && !isCurrent && "text-muted-foreground/75",
          )}
        >
          {stage.title}
        </span>
      </span>
      {index < AIM_WORKFLOW_STAGES.length - 1 ? (
        <span
          className={cn(
            "mx-0.5 h-0.5 w-4 shrink-0 self-center rounded-full transition-all duration-300",
            index < currentIndex
              ? "bg-gradient-to-r from-emerald-500/60 to-primary/30"
              : index === currentIndex
                ? "bg-gradient-to-r from-primary/40 to-border/60"
                : "bg-border/70",
          )}
          aria-hidden
        />
      ) : null}
    </li>
  )
}
