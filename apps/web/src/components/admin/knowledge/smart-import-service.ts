import type { SmartImportEdit, SmartImportPreviewData } from "./smart-import-types"

export async function analyzeSmartImport(input: {
  files: File[]
  projectId: string
  token: string
}): Promise<SmartImportPreviewData> {
  const formData = new FormData()
  input.files.forEach((file) => formData.append("files", file))
  if (input.projectId !== "none") formData.append("projectId", input.projectId)
  const response = await fetch("/api/admin/knowledge/smart-import", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}` },
    body: formData,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "分析失败" }))
    throw new Error(error.error || "智能分析失败")
  }
  const data = await response.json() as { data: SmartImportPreviewData }
  return data.data
}

export async function confirmSmartImport(input: {
  preview: SmartImportPreviewData
  edits: Record<number, SmartImportEdit>
  token: string
}): Promise<number> {
  const entries = input.preview.processed.filter((item) => !input.edits[item.index]?.skip).map((item) => ({
    title: input.edits[item.index]?.title || item.suggestedTitle,
    content: item.originalText,
    category: input.edits[item.index]?.category || item.suggestedCategory,
    tags: input.edits[item.index]?.tags || item.suggestedTags,
    valueGrade: input.edits[item.index]?.valueGrade || item.suggestedValueGrade,
  }))
  const response = await fetch("/api/admin/knowledge/smart-import/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.token}` },
    body: JSON.stringify({ userId: input.preview.userId, projectId: input.preview.projectId, entries }),
  })
  if (!response.ok) throw new Error("确认导入失败")
  await response.json().catch(() => null)
  return entries.length
}
