"use client"

import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type AimWorkflowStage, AIM_WORKFLOW_STAGES } from "@/lib/aim-workflow"
import { groupAimWorkflowTasks } from "@/lib/aim-workflow-tasks"
import type { AimGeneration } from "@/lib/api/client"

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
}

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
  const grouped = groupAimWorkflowTasks(records)
  const total = Object.values(grouped).reduce((count, tasks) => count + tasks.length, 0)

  return (
    <section className="border-b px-3 py-3" aria-label="项目任务">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">项目待推进</p>
            <p className="text-xs text-muted-foreground">每条内容只显示一个当前动作</p>
          </div>
          <span className="text-xs text-muted-foreground">{loading ? "加载中" : `${total} 项待推进`}</span>
        </div>
        {total === 0 && !loading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            当前项目没有待推进内容，可以从任一阶段开始。
          </div>
        ) : (
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {AIM_WORKFLOW_STAGES.map((stage) => {
              const tasks = grouped[stage.id].slice(0, 2)
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
        )}
      </div>
    </section>
  )
}
