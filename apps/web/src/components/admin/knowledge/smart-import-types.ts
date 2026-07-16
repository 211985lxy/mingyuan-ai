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

export interface SmartImportEdit {
  title?: string
  category?: string
  tags?: string[]
  valueGrade?: string
  skip?: boolean
}

export interface SmartImportProjectOption {
  id: string
  label: string
}
