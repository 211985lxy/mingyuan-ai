"use client"

import { useCallback, useEffect, useState } from "react"

import {
  fetchKnowledgeAssetHealth,
  listClientProjects,
  listKnowledge,
  listPendingAimHistory,
  type AimGeneration,
  type ClientProject,
} from "@/lib/api/client"
import {
  countReadyAssetBoxes,
  type KnowledgeAssetHealthResult,
} from "@/lib/knowledge-asset-health"

type LoadState<T> = { data: T; loading: boolean; error: string | null }

const initial = <T,>(data: T): LoadState<T> => ({ data, loading: true, error: null })

export type AccountAssetSummary = {
  projectId: string | null
  ready: number
  total: number
  health: KnowledgeAssetHealthResult | null
}

const emptyAsset: AccountAssetSummary = { projectId: null, ready: 0, total: 5, health: null }

async function resolveAccountAssetSummary(
  projectList?: ClientProject[],
): Promise<AccountAssetSummary> {
  const rows = projectList ?? (await listClientProjects("all"))
  const active = rows.find((project) => project.status === "active") ?? rows[0] ?? null
  if (!active) return emptyAsset
  const payload = await fetchKnowledgeAssetHealth(active.id)
  const counts = countReadyAssetBoxes(payload.health)
  return {
    projectId: active.id,
    ready: counts.ready,
    total: counts.total,
    health: payload.health,
  }
}

function failMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

/**
 * 工作总览摘要：项目、待推进、知识条数、默认账户五盒就绪度。
 */
export function useAimHomeSummary() {
  const [projects, setProjects] = useState(() => initial<ClientProject[]>([]))
  const [pending, setPending] = useState(() =>
    initial<{ items: AimGeneration[]; total: number }>({ items: [], total: 0 }),
  )
  const [knowledge, setKnowledge] = useState(() => initial(0))
  const [accountAsset, setAccountAsset] = useState(() => initial(emptyAsset))

  const loadProjects = useCallback(async () => {
    setProjects((state) => ({ ...state, loading: true, error: null }))
    try {
      const rows = await listClientProjects("all")
      setProjects({ data: rows, loading: false, error: null })
      return rows
    } catch (error) {
      setProjects((state) => ({ ...state, loading: false, error: failMessage(error, "项目读取失败") }))
      return [] as ClientProject[]
    }
  }, [])

  const loadAccountAsset = useCallback(async (projectList?: ClientProject[]) => {
    setAccountAsset((state) => ({ ...state, loading: true, error: null }))
    try {
      setAccountAsset({ data: await resolveAccountAssetSummary(projectList), loading: false, error: null })
    } catch (error) {
      setAccountAsset((state) => ({
        ...state,
        loading: false,
        error: failMessage(error, "账户资料读取失败"),
      }))
    }
  }, [])

  const loadPending = useCallback(async () => {
    setPending((state) => ({ ...state, loading: true, error: null }))
    try {
      setPending({ data: await listPendingAimHistory(6), loading: false, error: null })
    } catch (error) {
      setPending((state) => ({ ...state, loading: false, error: failMessage(error, "待办读取失败") }))
    }
  }, [])

  const loadKnowledge = useCallback(async () => {
    setKnowledge((state) => ({ ...state, loading: true, error: null }))
    try {
      setKnowledge({ data: (await listKnowledge()).length, loading: false, error: null })
    } catch (error) {
      setKnowledge((state) => ({ ...state, loading: false, error: failMessage(error, "知识库读取失败") }))
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await loadAccountAsset(await loadProjects())
    })()
    void loadPending()
    void loadKnowledge()
  }, [loadAccountAsset, loadKnowledge, loadPending, loadProjects])

  return {
    projects,
    pending,
    knowledge,
    accountAsset,
    loadProjects,
    loadPending,
    loadKnowledge,
    loadAccountAsset,
  }
}
