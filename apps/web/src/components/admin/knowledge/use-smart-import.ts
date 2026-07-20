"use client"

import React from "react"
import { toast } from "sonner"
import type { SmartImportEdit, SmartImportPreviewData } from "./smart-import-types"
import { analyzeSmartImport, confirmSmartImport } from "./smart-import-service"

/**
 * @description React Hook：smartimport
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useSmartImport(input: {
  defaultProjectId: string
  getToken: () => string
  onImported: () => void
  onClose: () => void
}) {
  const [step, setStep] = React.useState<"upload" | "processing" | "preview">("upload")
  const [files, setFiles] = React.useState<File[]>([])
  const [projectId, setProjectId] = React.useState(input.defaultProjectId)
  const [preview, setPreview] = React.useState<SmartImportPreviewData | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [edits, setEdits] = React.useState<Record<number, SmartImportEdit>>({})
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set())

  const reset = React.useCallback(() => {
    setStep("upload")
    setFiles([])
    setProjectId(input.defaultProjectId)
    setPreview(null)
    setEdits({})
    setExpanded(new Set())
  }, [input.defaultProjectId])

  async function analyze() {
    if (!files.length) return
    setStep("processing")
    setEdits({})
    setPreview(null)
    try {
      const data = await analyzeSmartImport({ files, projectId, token: input.getToken() })
      setPreview(data)
      setStep("preview")
    } catch (error) {
      toast.error(`智能分析失败：${error instanceof Error ? error.message : "未知错误"}`)
      setStep("upload")
    }
  }

  async function confirm() {
    if (!preview) return
    setConfirming(true)
    try {
      const count = await confirmSmartImport({ preview, edits, token: input.getToken() })
      toast.success(`已导入 ${count} 条知识`)
      reset()
      input.onClose()
      input.onImported()
    } catch (error) {
      toast.error(`导入失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setConfirming(false)
    }
  }

  const updateEdit = (index: number, patch: SmartImportEdit) => setEdits((current) => ({ ...current, [index]: { ...current[index], ...patch } }))
  const toggleExpanded = (index: number) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index); else next.add(index)
    return next
  })
  return { step, setStep, files, setFiles, projectId, setProjectId, preview, confirming, edits, expanded, reset, analyze, confirm, updateEdit, toggleExpanded }
}
