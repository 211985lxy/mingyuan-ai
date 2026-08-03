"use client"

import type { SmartImportEdit, SmartImportPreviewData } from "@/features/knowledge/components/customer-smart-import-types"

export async function analyzeCustomerSmartImport(files: File[], projectId: string): Promise<SmartImportPreviewData> {
  const formData = new FormData()
  for (const file of files) formData.append("files", file)
  formData.append("projectId", projectId)
  const response = await fetch("/api/knowledge/smart-import", { method: "POST", body: formData })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "分析失败" }))
    throw new Error(error.error || "智能分析失败")
  }
  const data = await response.json()
  return data.data as SmartImportPreviewData
}

export async function confirmCustomerSmartImport(input: {
  projectId: string
  processed: SmartImportPreviewData["processed"]
  edits: Record<number, SmartImportEdit>
}) {
  const entries = input.processed
    .filter((item) => !input.edits[item.index]?.skip)
    .map((item) => {
      const edit = input.edits[item.index]
      return {
        title: edit?.title || item.suggestedTitle,
        content: item.originalText,
        category: edit?.category || item.suggestedCategory,
        tags: edit?.tags || item.suggestedTags,
        valueGrade: edit?.valueGrade || item.suggestedValueGrade,
      }
    })
  const response = await fetch("/api/knowledge/smart-import/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: input.projectId, entries }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "确认导入失败" }))
    throw new Error(error.error || "确认导入失败")
  }
  return entries.length
}
