"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { AimEvolutionSuggestion } from "@/lib/api/client"

export { AimWorkbenchHeader } from "@/components/aim/aim-workbench-header"
export type { AimWorkbenchHeaderProps } from "@/components/aim/aim-workbench-header"
export { AimLandingHero } from "@/components/aim/aim-landing-hero"

/**
 * @description AIM 项目提示条（无项目 / 加载中 / 权限错误）
 */
export function AimProjectNotices({
  projectsCount,
  selectedProjectId,
  projectEnabled,
  projectAccessError,
}: {
  projectsCount: number
  selectedProjectId: string
  projectEnabled: boolean
  projectAccessError?: string | null
}) {
  return (
    <>
      {projectEnabled && projectsCount === 0 ? (
        <div className="border-b bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
          还没有项目，
          <Link
            href="/projects"
            className="text-primary underline-offset-2 hover:underline"
          >
            先创建一个
          </Link>
          ，生成内容可自动归属。
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
export function AimEvolutionSuggestions({
  suggestions,
  onDismiss,
  onSave,
}: {
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
          <div
            key={`${suggestion.title}-${suggestion.content}`}
            className="rounded-md border bg-background p-3.5"
          >
            <p className="text-base font-medium text-foreground">{suggestion.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {suggestion.content}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-sm"
                onClick={() => onDismiss(suggestion)}
              >
                忽略
              </Button>
              <Button
                size="sm"
                className="h-8 px-2.5 text-sm"
                onClick={() => onSave(suggestion)}
              >
                写入知识库
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
