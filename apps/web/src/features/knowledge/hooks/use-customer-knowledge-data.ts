"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ApiError,
  listClientProjects,
  listKnowledge,
  type ClientProject,
  type KnowledgeEntry,
} from "@/lib/api/client"
import { ensureDefaultAccountProject } from "@/features/knowledge/ensure-default-account-project"

export function useCustomerKnowledgeData(input: {
  statusFilter: "active" | "archived"
  projectFilter: string
  categoryFilter: string
}) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(null)
  const [ensuringAccount, setEnsuringAccount] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextEntries, nextProjects] = await Promise.all([
        listKnowledge({
          status: input.statusFilter,
          ...(input.projectFilter !== "all" && input.projectFilter !== "none"
            ? { projectId: input.projectFilter }
            : {}),
          ...(input.categoryFilter !== "all" ? { category: input.categoryFilter } : {}),
        }),
        listClientProjects("active"),
      ])
      setEntries(nextEntries)
      setProjects(nextProjects)
      const active = nextProjects.find((project) => project.status === "active")
      if (active) setDefaultAccountId(active.id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLoadError(null)
        return
      }
      setLoadError(error instanceof Error ? error.message : "知识库读取失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }, [input.categoryFilter, input.projectFilter, input.statusFilter])

  useEffect(() => { void load() }, [load])

  const ensureAccount = useCallback(async () => {
    setEnsuringAccount(true)
    try {
      const result = await ensureDefaultAccountProject(projects)
      if (result.created) {
        setProjects((current) => [result.project, ...current])
      }
      setDefaultAccountId(result.project.id)
      return result.project
    } finally {
      setEnsuringAccount(false)
    }
  }, [projects])

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) map.set(project.id, project.name)
    return map
  }, [projects])

  return {
    entries,
    projects,
    loading,
    loadError,
    load,
    projectNameById,
    defaultAccountId,
    ensuringAccount,
    ensureAccount,
  }
}
