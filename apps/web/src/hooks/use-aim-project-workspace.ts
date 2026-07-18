"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { listAimHistory, listClientProjects, type AimGeneration, type ClientProject } from "@/lib/api/client"

export function selectAuthorizedProjectId(currentProjectId: string, projects: ClientProject[]) {
  if (currentProjectId && projects.some((project) => project.id === currentProjectId)) return currentProjectId
  return projects[0]?.id || ""
}

export function useAimProjectWorkspace(initialProjectId: string) {
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  const [projectEnabled, setProjectEnabled] = useState(false)
  const [projectWorkflowRecords, setProjectWorkflowRecords] = useState<AimGeneration[]>([])
  const [isLoadingProjectWorkflow, setIsLoadingProjectWorkflow] = useState(false)
  const workflowRequestRef = useRef(0)

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

  useEffect(() => {
    let active = true
    listClientProjects()
      .then((items) => {
        if (!active) return
        setProjects(items)
        setProjectEnabled(items.length > 0)
        setSelectedProjectId((current) => selectAuthorizedProjectId(current, items))
      })
      .catch(() => {
        if (active) setProjectEnabled(false)
      })
    return () => {
      active = false
    }
  }, [])

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
    setSelectedProjectId,
    projectEnabled,
    setProjectEnabled,
    projectWorkflowRecords,
    isLoadingProjectWorkflow,
    refreshProjectWorkflow,
  }
}
