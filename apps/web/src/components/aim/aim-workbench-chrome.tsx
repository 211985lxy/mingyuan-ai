"use client"

import Link from "next/link"
import type { ComponentType, ReactNode } from "react"
import { Check, Edit3, FileSearch, Plus, Repeat2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { AimEvolutionSuggestion } from "@/lib/api/client"
import type { ClientProject } from "@/lib/api/client"
import { AIM_WORKFLOW_STAGES, isAimWorkflowStage, type AimContentAction, type AimWorkflowStage } from "@/lib/aim-workflow"

interface AimWorkbenchHeaderProps {
  workflowStage: AimWorkflowStage
  agentTitle: string
  AgentIcon: ComponentType<{ className?: string }>
  projectEnabled: boolean
  projects: ClientProject[]
  selectedProjectId: string
  canEvolve: boolean
  isEvolving: boolean
  /** 空状态（未开始任务）时不展示完整四阶段步骤条，避免与正文快捷入口重复 */
  showStageProgress: boolean
  onStageChange: (stage: AimWorkflowStage) => void
  onProjectScopeChange: (scope: string) => void
  onEvolve: () => void
  onReset: () => void
}

/**
 * @description aimworkbenchheader
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AimWorkbenchHeader({
  workflowStage,
  agentTitle,
  AgentIcon,
  projectEnabled,
  projects,
  selectedProjectId,
  canEvolve,
  isEvolving,
  showStageProgress,
  onStageChange,
  onProjectScopeChange,
  onEvolve,
  onReset,
}: AimWorkbenchHeaderProps) {
  const currentIndex = AIM_WORKFLOW_STAGES.findIndex((stage) => stage.id === workflowStage)
  const activeDescription = AIM_WORKFLOW_STAGES.find((stage) => stage.id === workflowStage)?.description

  const newTaskButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8 shrink-0 gap-1 px-2 md:h-8"
      onClick={onReset}
      aria-label="新任务：清空旧稿并开始新任务"
      title="清空旧稿并开始新任务"
    >
      <Plus className="h-4 w-4" />
      <span className="text-sm">新任务</span>
    </Button>
  )

  const evolveButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 shrink-0 px-2 md:h-8"
      onClick={onEvolve}
      disabled={!canEvolve}
      aria-label={isEvolving ? "偏好沉淀：提炼中" : "偏好沉淀：从当前对话提炼客户偏好并更新全局写作风格档案"}
      title="从当前对话提炼客户偏好 + 更新全局写作风格档案"
    >
      <Sparkles className="h-4 w-4" />
    </Button>
  )

  const projectSelect = (
    <select
      value={projectEnabled ? selectedProjectId : "quick"}
      onChange={(event) => onProjectScopeChange(event.target.value)}
      aria-label="选择客户全案或快速出稿模式"
      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-auto sm:flex-none md:h-8"
    >
      {projectEnabled && !selectedProjectId ? <option value="" disabled>项目不可用</option> : null}
      <option value="quick">快速出稿</option>
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
  )

  return (
    <header className="flex flex-col gap-1.5 border-b border-border/50 px-3 py-1.5 md:flex-row md:items-center md:justify-between md:gap-2 md:px-4">
      {/* 移动端第一行：当前阶段 + 新任务；桌面端：智能体标题 + 完整步骤条 */}
      <div className="flex min-w-0 items-center gap-2.5 md:flex-1 md:flex-wrap">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
          {showStageProgress ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <select
                value={workflowStage}
                onChange={(event) => {
                  if (isAimWorkflowStage(event.target.value)) onStageChange(event.target.value)
                }}
                aria-label="当前工作流阶段"
                className="h-9 w-full max-w-[190px] rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {AIM_WORKFLOW_STAGES.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.title}</option>
                ))}
              </select>
              {activeDescription && (
                <p className="max-w-[190px] truncate text-xs text-muted-foreground">{activeDescription}</p>
              )}
            </div>
          ) : (
            <p className="min-w-0 flex-1 truncate text-base font-medium text-foreground">{agentTitle}</p>
          )}
        </div>
        <div className="shrink-0 md:hidden">{newTaskButton}</div>

        <span className="hidden h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary md:flex">
          <AgentIcon className="h-4 w-4" />
        </span>
        <p className="hidden shrink-0 truncate text-sm font-semibold text-foreground md:block">{agentTitle}</p>
        {showStageProgress && (
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
                        "flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors",
                        isCurrent && "bg-primary/10 text-primary",
                        isDone && "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        !isCurrent && !isDone && "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
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
              <p className="hidden truncate pl-7 text-[11px] text-muted-foreground xl:block">{activeDescription}</p>
            )}
          </nav>
        )}
      </div>

      {/* 移动端第二行：项目选择 + 辅助操作；桌面端：项目选择、偏好沉淀、新任务 */}
      <div className="flex items-center gap-2 md:shrink-0">
        {projectSelect}
        <div className="flex shrink-0 items-center gap-2">
          {evolveButton}
          <div className="hidden md:block">{newTaskButton}</div>
        </div>
      </div>
    </header>
  )
}

/**
 * @description aimprojectnotices
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AimProjectNotices({ projectsCount, selectedProjectId, projectEnabled, projectAccessError, personaProgress }: {
  projectsCount: number
  selectedProjectId: string
  projectEnabled: boolean
  projectAccessError?: string | null
  personaProgress: number | null
}) {
  return (
    <>
      {!projectEnabled ? (
        <div className="border-b bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
          快速出稿不会读取客户全案资料，生成后可手动保存到全案。
        </div>
      ) : projectsCount === 0 ? (
        <div className="border-b bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
          还没有 IP 营销全案，<Link href="/projects" className="text-primary underline-offset-2 hover:underline">先创建一个</Link>，生成内容可自动归属。
        </div>
      ) : null}
      {projectAccessError ? (
        <div className="border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          {projectAccessError}
        </div>
      ) : projectEnabled && projectsCount > 0 && !selectedProjectId ? (
        <div className="border-b bg-amber-500/10 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          正在加载你的 IP 营销全案，请稍后再生成内容。
        </div>
      ) : null}
      {personaProgress != null ? (
        <div className="border-b bg-primary/5 px-4 py-2.5">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 xl:max-w-7xl">
            <span className="shrink-0 text-sm font-medium text-primary">来时路信息收集</span>
            <Progress value={personaProgress} className="h-1.5 flex-1" />
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{personaProgress}%</span>
          </div>
        </div>
      ) : null}
    </>
  )
}

/**
 * @description aimevolutionsuggestions
 * @param options - 配置选项
 * @returns 无返回值
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

interface AimLandingAction {
  label: string
  icon: ComponentType<{ className?: string }>
}

const AIM_LANDING_CONTENT_ACTIONS: Record<"new_copy" | "edit_current" | "rewrite_reference", AimLandingAction> = {
  new_copy: { label: "从想法出一稿", icon: Sparkles },
  edit_current: { label: "修改现有文案", icon: Edit3 },
  rewrite_reference: { label: "按对标重写", icon: Repeat2 },
}

/**
 * @description AIM 空状态：结果导向标题 + 4 个快捷入口 + composer 组成同一居中区域，
 * 用户开始任务后此区域即被替换为正常工作台布局（composer 沉底）。
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AimLandingHero({
  onBeginContentAction,
  children,
}: {
  onBeginContentAction: (action: AimContentAction) => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
      <div className="flex w-full max-w-3xl flex-col items-center gap-7">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          今天想得到什么结果？
        </h1>
        <div className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
          {(Object.entries(AIM_LANDING_CONTENT_ACTIONS) as Array<[AimContentAction, AimLandingAction]>).map(
            ([id, action]) => (
              <button
                key={id}
                type="button"
                onClick={() => onBeginContentAction(id)}
                className="flex h-12 items-center gap-2 rounded-xl border bg-background px-3.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <action.icon className="h-4 w-4 shrink-0 opacity-70" />
                <span className="truncate">{action.label}</span>
              </button>
            ),
          )}
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
