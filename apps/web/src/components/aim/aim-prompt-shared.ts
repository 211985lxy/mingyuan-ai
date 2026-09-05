"use client"

/**
 * AimPromptComposer 及其子组件共享的类型与纯辅助。
 * 抽出独立文件是为了：
 *   - aim-prompt-composer.tsx 瘦身（通过 file 500 行护栏）
 *   - 子组件（aim-action-bar / aim-add-menu-panel）不再重复定义
 */
import { useMemo } from "react"

import { COPY_STUDIO_MODULES, COPY_STUDIO_MODULE_LABELS, type CopyStudioModule } from "@/lib/copy-studio"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"

export type AimComposerMode = "direct" | "plan"

export function useContentModeOptions(): Array<{
  id: CopyStudioModule | undefined
  label: string
  hint: string
}> {
  return useMemo(() => ([
    { id: undefined, label: "智能选择", hint: "按内容自动路由" },
    ...COPY_STUDIO_MODULES.map((module) => ({
      id: module as CopyStudioModule | undefined,
      label: COPY_STUDIO_MODULE_LABELS[module],
      hint: "",
    })),
  ]), [])
}

export function buildFilteredSkills(
  skillQuery: string,
  skills: AimWorkbenchSkill[],
): Array<{ group: string; items: AimWorkbenchSkill[] }> {
  const query = skillQuery.trim().toLowerCase()
  const base = query
    ? skills.filter((skill) =>
        `${skill.label} ${skill.description}`.toLowerCase().includes(query),
      )
    : skills

  const groups: Array<{ group: string; items: AimWorkbenchSkill[] }> = []
  for (const skill of base) {
    const key = skill.group ?? ""
    const existing = groups.find((g) => g.group === key)
    if (existing) existing.items.push(skill)
    else groups.push({ group: key, items: [skill] })
  }
  return groups
}
