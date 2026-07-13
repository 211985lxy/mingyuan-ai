"use client"

import { useCallback, useEffect, useState } from "react"
import { listAimHistory, listClientProjects, type AimGeneration, type ClientProject } from "@/lib/api/client"

export function useAimProjectWorkflow(initialProjectId: string) {
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [projectWorkflowRecords, setProjectWorkflowRecords] = useState<AimGeneration[]>([])
  const [isLoadingProjectWorkflow, setIsLoadingProjectWorkflow] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  const [projectEnabled, setProjectEnabled] = useState(false)

  const refreshProjectWorkflow = useCallback((projectId = selectedProjectId) => {
    if (!projectId) {
      setProjectWorkflowRecords([])
      return
    }
    let active = true
    setIsLoadingProjectWorkflow(true)
    void listAimHistory(1, 50, projectId)
      .then((items) => { if (active) setProjectWorkflowRecords(items) })
      .catch(() => { if (active) setProjectWorkflowRecords([]) })
      .finally(() => { if (active) setIsLoadingProjectWorkflow(false) })
    return () => { active = false }
  }, [selectedProjectId])

  useEffect(() => {
    listClientProjects()
      .then((items) => {
        setProjects(items)
        setProjectEnabled(items.length > 0)
        setSelectedProjectId((current) => {
          if (current && items.some((project) => project.id === current)) return current
          return items[0]?.id || ""
        })
      })
      .catch(() => setProjectEnabled(false))
  }, [])

  useEffect(() => {
    return refreshProjectWorkflow()
  }, [refreshProjectWorkflow])

  return {
    projects,
    projectWorkflowRecords,
    isLoadingProjectWorkflow,
    selectedProjectId,
    setSelectedProjectId,
    projectEnabled,
    setProjectEnabled,
    refreshProjectWorkflow,
  }
}
