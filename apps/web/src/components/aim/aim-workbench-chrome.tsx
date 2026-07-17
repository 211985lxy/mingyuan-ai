"use client"

import Link from "next/link"
import type { ComponentType } from "react"
import { Check, Plus, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { AimEvolutionSuggestion } from "@/lib/api/client"
import { AIM_WORKFLOW_STAGES, isAimWorkflowStage, type AimWorkflowStage } from "@/lib/aim-workflow"

interface AimWorkbenchHeaderProps {
  workflowStage: AimWorkflowStage
  agentTitle: string
  AgentIcon: ComponentType<{ className?: string }>
  projectEnabled: boolean
  projectName?: string
  canEvolve: boolean
  isEvolving: boolean
  onStageChange: (stage: AimWorkflowStage) => void
  onToggleProject: () => void
  onEvolve: () => void
  onReset: () => void
}

export function AimWorkbenchHeader({
  workflowStage,
  agentTitle,
  AgentIcon,
  projectEnabled,
  projectName,
  canEvolve,
  isEvolving,
  onStageChange,
  onToggleProject,
  onEvolve,
  onReset,
}: AimWorkbenchHeaderProps) {
  const currentIndex = AIM_WORKFLOW_STAGES.findIndex((stage) => stage.id === workflowStage)
  const activeDescription = AIM_WORKFLOW_STAGES.find((stage) => stage.id === workflowStage)?.description

  return (
    <header className="flex items-center justify-between gap-3 border-b px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div className="flex flex-col gap-0.5 md:hidden">
          <select
            value={workflowStage}
            onChange={(event) => {
              if (isAimWorkflowStage(event.target.value)) onStageChange(event.target.value)
            }}
            className="h-9 w-[150px] rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {AIM_WORKFLOW_STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.title}</option>
            ))}
          </select>
          {activeDescription && (
            <p className="max-w-[150px] truncate text-[11px] text-muted-foreground">{activeDescription}</p>
          )}
        </div>
        <span className="hidden h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary md:flex">
          <AgentIcon className="h-4 w-4" />
        </span>
        <p className="hidden shrink-0 truncate text-sm font-semibold text-foreground md:block">{agentTitle}</p>
        <nav className="hidden min-w-0 flex-col gap-1 md:flex" aria-label="AIM 工作流">
          <ol className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {AIM_WORKFLOW_STAGES.map((stage, index) => {
              const isCurrent = stage.id === workflowStage
              const isDone = index < currentIndex
              return (
                <li key={stage.id} className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => onStageChange(stage.id)}
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                      isCurrent && "bg-primary/10 text-primary",
                      isDone && "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      !isCurrent && !isDone && "text-muted-foreground/50 hover:bg-muted/60 hover:text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                        isCurrent && "bg-primary text-primary-foreground",
                        isDone && "bg-muted-foreground/20 text-muted-foreground",
                        !isCurrent && !isDone && "border border-muted-foreground/30 text-transparent",
                      )}
                    >
                      {isDone ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    {stage.title}
                  </button>
                  {index < AIM_WORKFLOW_STAGES.length - 1 && (
                    <span className="mx-0.5 h-px w-4 shrink-0 bg-border" aria-hidden />
                  )}
                </li>
              )
            })}
          </ol>
          {activeDescription && (
            <p className="truncate pl-6 text-[11px] text-muted-foreground">{activeDescription}</p>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={projectEnabled ? "secondary" : "outline"}
          className="hidden h-8 max-w-[220px] gap-1.5 truncate sm:inline-flex"
          onClick={onToggleProject}
          title={projectEnabled ? "已启用 IP 全案上下文，点击切到纯文案模式" : "纯文案模式，点击启用 IP 全案上下文"}
        >
          {projectEnabled ? (projectName ?? "IP 全案") : "纯文案模式"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2"
          onClick={onEvolve}
          disabled={!canEvolve}
          title="从当前对话提炼客户偏好 + 更新全局写作风格档案"
        >
          <Sparkles className="h-4 w-4" />
          <span className="sr-only">{isEvolving ? "提炼中" : "沉淀偏好与风格"}</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={onReset} title="清空旧稿并开始新任务">
          <Plus className="h-4 w-4" />
          <span className="hidden text-xs sm:inline">新任务</span>
        </Button>
      </div>
    </header>
  )
}

export function AimProjectNotices({ projectsCount, selectedProjectId, personaProgress }: {
  projectsCount: number
  selectedProjectId: string
  personaProgress: number | null
}) {
  return (
    <>
      {projectsCount === 0 ? (
        <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          还没有 IP 营销全案，<Link href="/projects" className="text-primary underline-offset-2 hover:underline">先创建一个</Link>，生成内容可自动归属。
        </div>
      ) : null}
      {projectsCount > 0 && !selectedProjectId ? (
        <div className="border-b bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          正在加载你的 IP 营销全案，请稍后再生成内容。
        </div>
      ) : null}
      {personaProgress != null ? (
        <div className="border-b bg-primary/5 px-3 py-2">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <span className="shrink-0 text-[11px] font-medium text-primary">来时路信息收集</span>
            <Progress value={personaProgress} className="h-1.5 flex-1" />
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{personaProgress}%</span>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function AimEvolutionSuggestions({ suggestions, onDismiss, onSave }: {
  suggestions: AimEvolutionSuggestion[]
  onDismiss: (suggestion: AimEvolutionSuggestion) => void
  onSave: (suggestion: AimEvolutionSuggestion) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="border-b bg-muted/30 px-3 py-3">
      <div className="mx-auto max-w-2xl space-y-2">
        <p className="text-xs font-medium text-muted-foreground">发现可沉淀的客户偏好</p>
        {suggestions.map((suggestion) => (
          <div key={`${suggestion.title}-${suggestion.content}`} className="rounded-md border bg-background p-3">
            <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{suggestion.content}</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onDismiss(suggestion)}>忽略</Button>
              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onSave(suggestion)}>写入知识库</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
