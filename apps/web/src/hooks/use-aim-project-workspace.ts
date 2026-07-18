"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { listAimHistory, listClientProjects, type AimGeneration, type ClientProject } from "@/lib/api/client"

export function selectAuthorizedProjectId(currentProjectId: string, projects: ClientProject[]) {
  if (currentProjectId && projects.some((project) => project.id === currentProjectId)) return currentProjectId
  return currentProjectId ? "" : projects[0]?.id || ""
}

export function useAimProjectWorkspace(input: { initialProjectId: string; quickMode: boolean }) {
  const { initialProjectId, quickMode } = input
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  const [projectEnabled, setProjectEnabled] = useState(!quickMode)
  const [projectAccessError, setProjectAccessError] = useState<string | null>(null)
  const [projectWorkflowRecords, setProjectWorkflowRecords] = useState<AimGeneration[]>([])
  const [isLoadingProjectWorkflow, setIsLoadingProjectWorkflow] = useState(false)
  const workflowRequestRef = useRef(0)
  const invalidProjectIdRef = useRef<string | null>(null)

  const selectProjectId = useCallback<React.Dispatch<React.SetStateAction<string>>>((value) => {
    invalidProjectIdRef.current = null
    setProjectAccessError(null)
    setSelectedProjectId((current) => {
      const next = typeof value === "function" ? value(current) : value
      return next
    })
  }, [])

  const refreshProjectWorkflow = useCallback(async () => {
    const requestId = ++workflowRequestRef.current
    if (!selectedProjectId) {
      setProjectWorkflowRecords([])
      setIsLoadingProjectWorkflow(false)
      return
    }
    setIsLoadingProjectWorkflow(true)
    try {
      const items = await listAimHistory(1, 50, selectedProjectId)
      if (requestId === workflowRequestRef.current) setProjectWorkflowRecords(items)
    } catch {
      if (requestId === workflowRequestRef.current) setProjectWorkflowRecords([])
    } finally {
      if (requestId === workflowRequestRef.current) setIsLoadingProjectWorkflow(false)
    }
  }, [selectedProjectId])

  const refreshProjects = useCallback(async () => {
    const items = await listClientProjects()
        setProjects(items)
        if (quickMode) {
          setProjectEnabled(false)
          setSelectedProjectId("")
          invalidProjectIdRef.current = null
          setProjectAccessError(null)
          return items
        }
        setProjectEnabled(true)
        setSelectedProjectId((current) => {
          const requested = current || invalidProjectIdRef.current || ""
          const next = selectAuthorizedProjectId(requested, items)
          if (requested && !next) {
            invalidProjectIdRef.current = requested
            setProjectAccessError("这个客户全案已失效或你无权访问，请重新选择")
            return ""
          }
          invalidProjectIdRef.current = null
          setProjectAccessError(null)
          return next
        })
        return items
  }, [quickMode])

  useEffect(() => {
    let active = true
    const task = Promise.resolve().then(refreshProjects)
    void task.catch(() => {
      if (!active) return
      setSelectedProjectId("")
      setProjectEnabled(!quickMode)
      setProjectAccessError(quickMode ? null : "客户全案读取失败，请切换到快速出稿或稍后重试")
    })
    return () => {
      active = false
    }
  }, [quickMode, refreshProjects])

  useEffect(() => {
    const task = Promise.resolve().then(refreshProjectWorkflow)
    void task
    return () => {
      workflowRequestRef.current += 1
    }
  }, [refreshProjectWorkflow])

  return {
    projects,
    selectedProjectId,
    setSelectedProjectId: selectProjectId,
    projectEnabled,
    setProjectEnabled,
    projectAccessError,
    projectWorkflowRecords,
    isLoadingProjectWorkflow,
    refreshProjectWorkflow,
    refreshProjects,
  }
}
