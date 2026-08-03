"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  analyzeCustomerSmartImport,
  confirmCustomerSmartImport,
} from "@/features/knowledge/hooks/customer-smart-import-api"
import {
  mergeSmartImportFiles,
  type SmartImportEdit,
  type SmartImportPreviewData,
} from "@/features/knowledge/components/customer-smart-import-types"
import type { ClientProject } from "@/lib/api/projects"

function resolveInitialProjectId(projects: ClientProject[], defaultProjectId?: string) {
  const options = projects.filter((project) => project.status !== "archived")
  const id =
    (defaultProjectId && options.some((project) => project.id === defaultProjectId)
      ? defaultProjectId
      : options[0]?.id) || ""
  return { options, id }
}

export function useCustomerSmartImportDialog(input: {
  projects: ClientProject[]
  defaultProjectId?: string
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { options: projectOptions, id: initialProjectId } = useMemo(
    () => resolveInitialProjectId(input.projects, input.defaultProjectId),
    [input.projects, input.defaultProjectId],
  )
  const [step, setStep] = useState<"upload" | "processing" | "preview">("upload")
  const [projectId, setProjectId] = useState(initialProjectId)
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [previewData, setPreviewData] = useState<SmartImportPreviewData | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [edits, setEdits] = useState<Record<number, SmartImportEdit>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("upload"); setFiles([]); setDragOver(false); setPreviewData(null)
      setEdits({}); setExpanded(new Set()); setProjectId(initialProjectId)
    } else setProjectId(initialProjectId)
    input.onOpenChange(nextOpen)
  }

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return
    setFiles((current) => mergeSmartImportFiles(current, incoming))
  }, [])

  async function analyze() {
    if (files.length === 0 || !projectId) {
      if (!projectId) toast.error("请先选择归属全案")
      return
    }
    setStep("processing"); setEdits({}); setPreviewData(null)
    try {
      setPreviewData(await analyzeCustomerSmartImport(files, projectId))
      setStep("preview")
    } catch (error) {
      toast.error(`智能分析失败：${error instanceof Error ? error.message : "未知错误"}`)
      setStep("upload")
    }
  }

  async function confirm() {
    if (!previewData?.projectId) return
    setConfirming(true)
    try {
      const count = await confirmCustomerSmartImport({
        projectId: previewData.projectId,
        processed: Array.isArray(previewData.processed) ? previewData.processed : [],
        edits,
      })
      handleOpenChange(false)
      toast.success(`已导入 ${count} 条知识`)
      input.onImported()
    } catch (error) {
      toast.error(`导入失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setConfirming(false)
    }
  }

  return {
    fileInputRef, projectOptions, step, setStep, projectId, setProjectId, files, setFiles,
    dragOver, setDragOver, previewData, confirming, edits, setEdits, expanded, setExpanded,
    handleOpenChange, addFiles, analyze, confirm,
    processed: Array.isArray(previewData?.processed) ? previewData.processed : [],
  }
}
