"use client"

import { useEffect, useState } from "react"

import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import { getAimAgentGuide } from "@/lib/aim-agent-guides"

interface CustomSkillRow {
  id: string
  skillId: string
  agentId: string
  label: string
  description: string
  prompt: string
  group: string
  isCustom: true
}

/** 拉取自定义 skill 并与内置 skill 合并。
 *  - 自定义 skill 的 skillId 与内置 id 相同时，自定义覆盖内置
 *  - 自定义 skill 追加到内置之后
 *  - 拉取失败时静默回退到只显示内置 skill */
export function useAimWorkbenchSkills(agentId: string | undefined): {
  skills: AimWorkbenchSkill[]
  customSkills: CustomSkillRow[]
  refresh: () => void
  loading: boolean
} {
  const [customSkills, setCustomSkills] = useState<CustomSkillRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!agentId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/aim/skills?agentId=${encodeURIComponent(agentId)}`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body: { data?: CustomSkillRow[] }) => {
        if (!cancelled) setCustomSkills(body.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setCustomSkills([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId, tick])

  const guide = agentId ? getAimAgentGuide(agentId) : null
  const builtinSkills: AimWorkbenchSkill[] = guide?.skills ?? []

  const customById = new Map<string, AimWorkbenchSkill>()
  for (const row of customSkills) {
    customById.set(row.skillId, {
      id: row.skillId,
      label: row.label,
      description: row.description,
      prompt: row.prompt,
      agentId: row.agentId as AimWorkbenchSkill["agentId"],
      group: row.group || undefined,
      isCustom: true,
    })
  }

  const merged: AimWorkbenchSkill[] = []
  for (const skill of builtinSkills) {
    merged.push(customById.get(skill.id) ?? skill)
    customById.delete(skill.id)
  }
  for (const remaining of customById.values()) {
    merged.push(remaining)
  }

  return {
    skills: merged,
    customSkills,
    refresh: () => setTick((n) => n + 1),
    loading,
  }
}
