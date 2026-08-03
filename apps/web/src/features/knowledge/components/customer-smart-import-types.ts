import type { ClientProject } from "@/lib/api/projects"

export interface SmartImportItem {
  index: number
  originalText: string
  detectedSource: string
  suggestedTitle: string
  suggestedKeyPoints: string
  suggestedCategory: string
  suggestedTags: string[]
  suggestedValueGrade: string
  duplicateOfId?: string
  duplicateScore?: number
  confidence: string
}

export interface SmartImportPreviewData {
  userId: string
  projectId: string | null
  processed: SmartImportItem[]
  fileNames: string[]
}

export type SmartImportEdit = {
  title?: string
  category?: string
  tags?: string[]
  valueGrade?: string
  skip?: boolean
}

export type CustomerSmartImportProject = ClientProject

export function mergeSmartImportFiles(current: File[], incoming: File[]) {
  const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
  const next = [...current]
  for (const file of incoming) {
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push(file)
  }
  return next
}
