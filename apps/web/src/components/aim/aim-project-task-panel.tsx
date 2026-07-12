"use client"

import { useState } from "react"
import { ArrowRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type AimWorkflowStage, AIM_WORKFLOW_STAGES } from "@/lib/aim-workflow"
import { groupAimWorkflowTasks } from "@/lib/aim-workflow-tasks"
import type { AimGeneration } from "@/lib/api/client"

export function AimProjectTaskPanel({
  records,
  loading,
  onOpenTask,
  onStartStage,
}: {
  records: AimGeneration[]
  loading?: boolean
  onOpenTask: (id: string) => void
  onStartStage: (stage: AimWorkflowStage) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const grouped = groupAimWorkflowTasks(records)
  const total = Object.values(grouped).reduce((count, tasks) => count + tasks.length, 0)

  if (!loading && total === 0) return null

  return (
    <section className="border-b px-3 py-1.5" aria-label="项目任务">
      <div className="w-full">
        <button
          type="button"
          className="flex h-7 w-full items-center gap-2 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="text-xs font-medium text-foreground">项目待推进</span>
          <span className="text-[11px] text-muted-foreground">{loading ? "加载中" : `${total} 项`}</span>
          <ChevronDown className={`ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded ? (
          <div className="grid gap-x-4 gap-y-1 pb-1 pt-2 sm:grid-cols-2">
            {AIM_WORKFLOW_STAGES.map((stage) => {
              const tasks = grouped[stage.id].slice(0, 1)
              return (
                <div key={stage.id} className="min-w-0 border-l-2 border-muted pl-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{stage.title}</span>
                    {!tasks.length && (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => onStartStage(stage.id)}>
                        开始
                      </Button>
                    )}
                  </div>
                  {tasks.map((task) => (
                    <button key={task.id} type="button" className="flex w-full items-center gap-1.5 py-1 text-left hover:text-primary" onClick={() => onOpenTask(task.id)}>
                      <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{task.nextAction}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
