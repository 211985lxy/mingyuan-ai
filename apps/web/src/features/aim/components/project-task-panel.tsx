"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type AimWorkflowStage, AIM_WORKFLOW_STAGES } from "@/lib/aim-workflow"
import { groupAimWorkflowTasks } from "@/features/aim/workflow/tasks"
import type { AimGeneration } from "@/lib/api/client"

export interface AimProjectTaskPanelProps {
  records: AimGeneration[]
  loading?: boolean
  onOpenTask: (id: string) => void
  onStartStage: (stage: AimWorkflowStage) => void
  /** 顶栏内联：触发器占一行高度，展开用浮层，不单独占行 */
  inline?: boolean
}

/**
 * 项目待推进任务：默认独立条；inline 时收成顶栏按钮 + 下拉浮层。
 */
export function AimProjectTaskPanel({
  records,
  loading,
  onOpenTask,
  onStartStage,
  inline = false,
}: AimProjectTaskPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const grouped = groupAimWorkflowTasks(records)
  const total = Object.values(grouped).reduce((count, tasks) => count + tasks.length, 0)

  useEffect(() => {
    if (!expanded || !inline) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [expanded, inline])

  if (!loading && total === 0) return null

  const menu = (
    <div className={inline
      ? "absolute right-0 top-[calc(100%+4px)] z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border bg-popover p-2 shadow-md"
      : "grid gap-x-4 gap-y-1 pb-1 pt-2 sm:grid-cols-2"}
    >
      <div className={inline ? "grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2" : "contents"}>
        {AIM_WORKFLOW_STAGES.map((stage) => {
          const tasks = grouped[stage.id].slice(0, 1)
          return (
            <div key={stage.id} className="min-w-0 border-l-2 border-muted pl-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{stage.title}</span>
                {!tasks.length && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={() => {
                      onStartStage(stage.id)
                      setExpanded(false)
                    }}
                  >
                    开始
                  </Button>
                )}
              </div>
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="flex w-full items-center gap-1.5 py-1 text-left hover:text-primary"
                  onClick={() => {
                    onOpenTask(task.id)
                    setExpanded(false)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{task.nextAction}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )

  if (inline) {
    return (
      <div ref={rootRef} className="relative shrink-0">
        <button
          type="button"
          className="inline-flex h-7 max-w-[9.5rem] items-center gap-1 rounded-md border border-input bg-background px-1.5 text-[11px] text-foreground outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-expanded={expanded}
          aria-haspopup="menu"
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="truncate font-medium">待推进</span>
          <span className="tabular-nums text-muted-foreground">{loading ? "…" : total}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded ? menu : null}
      </div>
    )
  }

  return (
    <section className="border-b px-2 py-0.5" aria-label="项目任务">
      <div className="w-full">
        <button
          type="button"
          className="flex h-6 w-full items-center gap-1.5 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="text-[11px] font-medium text-foreground">项目待推进</span>
          <span className="text-[10px] text-muted-foreground">{loading ? "加载中" : `${total} 项`}</span>
          <ChevronDown className={`ml-auto h-3 w-3 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded ? menu : null}
      </div>
    </section>
  )
}
