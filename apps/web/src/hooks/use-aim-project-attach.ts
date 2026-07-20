"use client"

import { useState } from "react"
import { toast } from "sonner"

import { createClientProject, updateAimWorkflowStatus, type ClientProject } from "@/lib/api/client"

export type AimProjectAttachMode = "existing" | "new"

/**
 * @description React Hook：aimprojectattach
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimProjectAttach(input: {
  projects: ClientProject[]
  refreshProjects: () => Promise<ClientProject[]>
  onAttached: (projectId: string, generationId: string) => void
}) {
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [mode, setMode] = useState<AimProjectAttachMode>(input.projects.length ? "existing" : "new")
  const [projectId, setProjectId] = useState("")
  const [projectName, setProjectName] = useState("")
  const [busy, setBusy] = useState(false)

  function open(nextGenerationId: string) {
    setGenerationId(nextGenerationId)
    setMode(input.projects.length ? "existing" : "new")
    setProjectId(input.projects[0]?.id || "")
    setProjectName("")
  }

  function close() {
    if (!busy) setGenerationId(null)
  }

  async function submit() {
    if (!generationId) return
    if (mode === "existing" && !projectId) return toast.error("请选择一个客户全案")
    if (mode === "new" && !projectName.trim()) return toast.error("请填写客户全案名称")
    setBusy(true)
    try {
      const targetProjectId = mode === "existing"
        ? projectId
        : (await createClientProject({ name: projectName.trim() })).id
      await updateAimWorkflowStatus(generationId, { projectId: targetProjectId })
      await input.refreshProjects()
      input.onAttached(targetProjectId, generationId)
      setGenerationId(null)
      toast.success("已保存到客户全案")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存到客户全案失败")
    } finally {
      setBusy(false)
    }
  }

  return {
    open: Boolean(generationId),
    generationId,
    mode,
    setMode,
    projectId,
    setProjectId,
    projectName,
    setProjectName,
    busy,
    openDialog: open,
    closeDialog: close,
    submit,
  }
}
