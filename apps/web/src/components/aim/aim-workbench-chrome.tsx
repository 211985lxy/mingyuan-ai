"use client"

import Link from "next/link"
import type { ComponentType, ReactNode } from "react"
import { Check, FileSearch, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AimEvolutionSuggestion } from "@/lib/api/client"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import { AIM_WORKFLOW_STAGES, type AimWorkflowStage } from "@/lib/aim-workflow"

interface AimWorkbenchHeaderProps {
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
 * 客户全案由工作台默认选中，不再提供「快速出稿」切换框。
 */
export function AimWorkbenchHeader({
  workflowStage,
  agentTitle,
  AgentIcon,
  showStageProgress,
  onReset,
}: AimWorkbenchHeaderProps) {
  const currentIndex = AIM_WORKFLOW_STAGES.findIndex((stage) => stage.id === workflowStage)

  return (
    <header className="relative z-30 flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1 md:gap-2 md:px-3">
      <span
        className="hidden size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:inline-flex"
        title={agentTitle}
      >
        <AgentIcon className="size-3.5" />
      </span>

      {showStageProgress ? (
        <>
          <p className="shrink-0 text-xs font-medium leading-none text-foreground md:hidden">
            {AIM_WORKFLOW_STAGES.find((stage) => stage.id === workflowStage)?.title ?? agentTitle}
          </p>
          <nav className="hidden min-w-0 flex-1 items-center md:flex" aria-label="AIM 工作流进度">
            <ol className="flex min-w-0 items-center">
              {AIM_WORKFLOW_STAGES.map((stage, index) => {
                const isCurrent = stage.id === workflowStage
                const isDone = index < currentIndex
                return (
                  <li key={stage.id} className="flex items-center">
                    <span
                      title={stage.description}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cn(
                        "inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium leading-none",
                        isCurrent && "bg-primary/10 text-primary",
                        isDone && "text-muted-foreground",
                        !isCurrent && !isDone && "text-muted-foreground/70",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-4 shrink-0 items-center justify-center rounded-full leading-none",
                          isCurrent && "bg-primary text-primary-foreground",
                          isDone && "bg-muted-foreground/20 text-muted-foreground",
                          !isCurrent && !isDone && "border border-muted-foreground/30",
                        )}
                      >
                        {isDone ? (
                          <Check className="size-2.5" strokeWidth={2.5} aria-hidden />
                        ) : isCurrent ? (
                          <span className="text-[10px] leading-none tabular-nums">{index + 1}</span>
                        ) : null}
                      </span>
                      <span className="leading-none">{stage.title}</span>
                    </span>
                    {index < AIM_WORKFLOW_STAGES.length - 1 ? (
                      <span className="mx-1 h-px w-2.5 shrink-0 self-center bg-border" aria-hidden />
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </nav>
          <span className="min-w-0 flex-1 md:hidden" aria-hidden />
        </>
      ) : (
        <p className="min-w-0 flex-1 truncate text-sm font-medium leading-none text-foreground">{agentTitle}</p>
      )}

      <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 rounded-md px-2 text-xs leading-none" onClick={onReset}>
        <Plus className="size-3.5" />
        新任务
      </Button>
    </header>
  )
}

/**
 * @description AIM 项目提示条（无项目 / 加载中 / 权限错误）
 */
export function AimProjectNotices({ projectsCount, selectedProjectId, projectEnabled, projectAccessError }: {
  projectsCount: number
  selectedProjectId: string
  projectEnabled: boolean
  projectAccessError?: string | null
}) {
  return (
    <>
      {projectEnabled && projectsCount === 0 ? (
        <div className="border-b bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
          还没有 IP 营销全案，<Link href="/projects" className="text-primary underline-offset-2 hover:underline">先创建一个</Link>，生成内容可自动归属。
        </div>
      ) : null}
      {projectAccessError ? (
        <div className="border-b bg-destructive/10 px-3 py-1 text-[11px] text-destructive">
          {projectAccessError}
        </div>
      ) : projectEnabled && projectsCount > 0 && !selectedProjectId ? (
        <div className="border-b bg-amber-500/10 px-3 py-1 text-[11px] text-amber-700 dark:text-amber-300">
          正在加载你的 IP 营销全案，请稍后再生成内容。
        </div>
      ) : null}
    </>
  )
}

/**
 * @description 对话演化偏好建议条
 */
export function AimEvolutionSuggestions({ suggestions, onDismiss, onSave }: {
  suggestions: AimEvolutionSuggestion[]
  onDismiss: (suggestion: AimEvolutionSuggestion) => void
  onSave: (suggestion: AimEvolutionSuggestion) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="border-b bg-muted/30 px-4 py-3">
      <div className="mx-auto w-full max-w-6xl space-y-2 xl:max-w-7xl">
        <p className="text-sm font-medium text-muted-foreground">发现可沉淀的客户偏好</p>
        {suggestions.map((suggestion) => (
          <div key={`${suggestion.title}-${suggestion.content}`} className="rounded-md border bg-background p-3.5">
            <p className="text-base font-medium text-foreground">{suggestion.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{suggestion.content}</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-8 px-2.5 text-sm" onClick={() => onDismiss(suggestion)}>忽略</Button>
              <Button size="sm" className="h-8 px-2.5 text-sm" onClick={() => onSave(suggestion)}>写入知识库</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * AIM 空状态：三目的入口 + 爆款拆解主入口 + composer。
 */
export function AimLandingHero({
  purposes,
  onSelectPurpose,
  children,
}: {
  purposes: AimWorkbenchSkill[]
  onSelectPurpose: (skill: AimWorkbenchSkill) => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
      <div className="flex w-full max-w-3xl flex-col items-center gap-7">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          今天想得到什么结果？
        </h1>
        <div className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
          {purposes.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => onSelectPurpose(skill)}
              className="flex h-12 items-center gap-2 rounded-xl border bg-background px-3.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <span className="truncate">{skill.label}</span>
            </button>
          ))}
          <Link
            href="/video-copy"
            className="flex h-12 items-center gap-2 rounded-xl border bg-background px-3.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <FileSearch className="h-4 w-4 shrink-0 opacity-70" />
            <span className="truncate">爆款拆解</span>
          </Link>
        </div>
        <div className="w-full">{children}</div>
      </div>
    </div>
  )
}
