"use client"

import { useCallback, useEffect, useState } from "react"

import {
  listClientProjects,
  listKnowledge,
  listPendingAimHistory,
  type AimGeneration,
  type ClientProject,
} from "@/lib/api/client"

type LoadState<T> = { data: T; loading: boolean; error: string | null }

const initial = <T,>(data: T): LoadState<T> => ({ data, loading: true, error: null })

/**
 * @description React Hook：aimhomesummary
 * @returns 无返回值
 */
export function useAimHomeSummary() {
  const [projects, setProjects] = useState(() => initial<ClientProject[]>([]))
  const [pending, setPending] = useState(() => initial<{ items: AimGeneration[]; total: number }>({ items: [], total: 0 }))
  const [knowledge, setKnowledge] = useState(() => initial(0))

  const loadProjects = useCallback(async () => {
    setProjects((state) => ({ ...state, loading: true, error: null }))
    try {
      setProjects({ data: await listClientProjects("all"), loading: false, error: null })
    } catch (error) {
      setProjects((state) => ({ ...state, loading: false, error: error instanceof Error ? error.message : "全案读取失败" }))
    }
  }, [])

  const loadPending = useCallback(async () => {
    setPending((state) => ({ ...state, loading: true, error: null }))
    try {
      setPending({ data: await listPendingAimHistory(6), loading: false, error: null })
    } catch (error) {
      setPending((state) => ({ ...state, loading: false, error: error instanceof Error ? error.message : "待办读取失败" }))
    }
  }, [])

  const loadKnowledge = useCallback(async () => {
    setKnowledge((state) => ({ ...state, loading: true, error: null }))
    try {
      const entries = await listKnowledge()
      setKnowledge({ data: entries.length, loading: false, error: null })
    } catch (error) {
      setKnowledge((state) => ({ ...state, loading: false, error: error instanceof Error ? error.message : "知识库读取失败" }))
    }
  }, [])

  useEffect(() => {
    void loadProjects()
    void loadPending()
    void loadKnowledge()
  }, [loadKnowledge, loadPending, loadProjects])

  return { projects, pending, knowledge, loadProjects, loadPending, loadKnowledge }
}
