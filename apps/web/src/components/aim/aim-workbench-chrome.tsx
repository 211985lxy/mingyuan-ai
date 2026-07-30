"use client"

import Link from "next/link"
import { useEffect, useState, type ComponentType, type ReactNode } from "react"
import { ArrowRight, Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AimEvolutionSuggestion, AimGeneration } from "@/lib/api/client"
import { listPendingAimHistory } from "@/lib/api/client"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import { AIM_WORKFLOW_STAGES, type AimWorkflowStage } from "@/lib/aim-workflow"
import { getContentTitle } from "@/lib/home-history-summary"
import { buildAimGenerationHref } from "@/features/aim/workflow/tasks"

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
            {AIM_WORKFLOW_STAGES.find((stage) => stage.id === workflowStage)?.title ?? agentTitle}
          </p>
          <nav className="hidden min-w-0 flex-1 items-center md:flex" aria-label="AIM 工作流进度">
            <ol className="flex min-w-0 items-center gap-1">
              {AIM_WORKFLOW_STAGES.map((stage, index) => {
                const isCurrent = stage.id === workflowStage
                const isDone = index < currentIndex
                const isNext = index === currentIndex + 1
                return (
                  <li key={stage.id} className="flex items-center">
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
                          !isCurrent && !isDone &&
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
                      <span className={cn(
                        "leading-none",
                        isCurrent && "font-semibold tracking-tight",
                        isNext && !isCurrent && "text-muted-foreground/75",
                      )}>
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
              })}
            </ol>
          </nav>
          <span className="min-w-0 flex-1 md:hidden" aria-hidden />
        </>
      ) : (
        <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-none tracking-tight text-foreground">{agentTitle}</p>
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
          还没有项目，<Link href="/projects" className="text-primary underline-offset-2 hover:underline">先创建一个</Link>，生成内容可自动归属。
        </div>
      ) : null}
      {projectAccessError ? (
        <div className="border-b bg-destructive/10 px-3 py-1 text-[11px] text-destructive">
          {projectAccessError}
        </div>
      ) : projectEnabled && projectsCount > 0 && !selectedProjectId ? (
        <div className="border-b bg-amber-500/10 px-3 py-1 text-[11px] text-amber-700 dark:text-amber-300">
          正在加载你的项目，请稍后再生成内容。
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

function AimContinueLast() {
  const [item, setItem] = useState<AimGeneration | null>(null)

  useEffect(() => {
    let cancelled = false
    listPendingAimHistory(1)
      .then((data) => {
        if (!cancelled) setItem(data.items[0] ?? null)
      })
      .catch(() => {
        if (!cancelled) setItem(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!item) return null

  return (
    <Link
      href={buildAimGenerationHref(item)}
      className="group flex w-full items-center gap-3 border-b border-border/60 pb-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">继续上次</p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground group-hover:text-primary">
          {getContentTitle(item)}
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
    </Link>
  )
}

/**
 * 创作台空状态：继续上次 + 专家简介 + 目的入口卡片 + 输入框。
 */
export function AimLandingHero({
  purposes,
  intro,
  onSelectPurpose,
  children,
}: {
  purposes: AimWorkbenchSkill[]
  intro?: string
  onSelectPurpose: (skill: AimWorkbenchSkill) => void
  children: ReactNode
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
      {/* 品牌氛围层 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 0%, oklch(0.575 0.205 28 / 0.07), transparent 70%),\n             radial-gradient(45% 40% at 12% 18%, oklch(0.745 0.185 38 / 0.06), transparent 65%),\n             radial-gradient(55% 55% at 88% 35%, oklch(0.945 0.025 76 / 0.35), transparent 70%)",
        }}
      />
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        <AimContinueLast />

        <div className="flex w-full flex-col items-center gap-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary/90">
            <span className="size-1.5 rounded-full bg-primary/70" />
            AI 协作台 · 专家待命
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-tight">
            今天想得到什么结果？
          </h1>
          {intro ? (
            <p className="mx-auto max-w-xl text-center text-sm leading-7 text-muted-foreground">
              {intro}
            </p>
          ) : null}
        </div>

        {purposes.length > 0 ? (
          <div className="w-full">
            <p className="mb-2.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
              一键开始 · 选择内容目的
            </p>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {purposes.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => onSelectPurpose(skill)}
                  className="group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border border-border/80 bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-gradient-to-br hover:from-card hover:via-primary/[0.03] hover:to-amber-500/[0.02] hover:shadow-[0_10px_30px_-14px_rgba(209,74,51,0.22)]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-0 top-0 h-20 w-20 translate-x-8 -translate-y-8 rounded-full bg-primary/[0.06] opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/12 to-amber-500/10 text-primary ring-1 ring-inset ring-primary/15">
                        <SparklesFilled className="size-4.5" strokeWidth={0} />
                      </span>
                      <span className="text-[15px] font-semibold leading-5 tracking-tight text-foreground">
                        {skill.label}
                      </span>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground/50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  {skill.description ? (
                    <p className="pl-[46px] text-[13px] leading-5 text-muted-foreground/90">
                      {skill.description}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="w-full">{children}</div>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/projects" className="underline-offset-2 hover:text-foreground hover:underline">
            我的项目
          </Link>
        </p>
      </div>
    </div>
  )
}

function SparklesFilled(props: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={props.className}>
      <path
        d="M12 2.25c.5 2.4 2.35 4.25 4.75 4.75-2.4.5-4.25 2.35-4.75 4.75-.5-2.4-2.35-4.25-4.75-4.75 2.4-.5 4.25-2.35 4.75-4.75Z"
        fill="currentColor"
      />
      <path
        d="M19.25 12.5c.25 1.2 1.18 2.12 2.37 2.37-1.2.25-2.12 1.18-2.37 2.37-.25-1.2-1.18-2.12-2.37-2.37 1.2-.25 2.12-1.18 2.37-2.37Z"
        fill="currentColor"
        opacity=".8"
      />
      <path
        d="M5 13.25c.35 1.65 1.6 2.9 3.25 3.25-1.65.35-2.9 1.6-3.25 3.25-.35-1.65-1.6-2.9-3.25-3.25 1.65-.35 2.9-1.6 3.25-3.25Z"
        fill="currentColor"
        opacity=".65"
      />
    </svg>
  )
}
