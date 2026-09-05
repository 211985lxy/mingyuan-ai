"use client"

/** 复盘表格导入结果：与服务端 POST /api/aim/outcome-import 响应结构保持一致。 */
export interface AimOutcomeImportResult {
  summary: string
  confidence: "high" | "medium" | "low"
  missingHints: string[]
}

/**
 * 上传平台导出的 xlsx/csv，识别到的指标直接写入该内容的发布数据。
 * 与粘贴路径同一条管线；解析失败服务端返回 422 与人话错误，不写库。
 */
export async function importOutcomeFile(input: {
  generationId: string
  file: File
}): Promise<AimOutcomeImportResult> {
  const form = new FormData()
  form.set("generationId", input.generationId)
  form.set("file", input.file)

  const response = await fetch("/api/aim/outcome-import", { method: "POST", body: form })
  const data: {
    error?: string
    summary?: string
    confidence?: string
    missingHints?: string[]
  } | null = await response.json().catch(() => null)

  if (!response.ok || !data?.summary) {
    throw new Error(data?.error || "表格导入失败")
  }
  return {
    summary: data.summary,
    confidence: (data.confidence as AimOutcomeImportResult["confidence"]) ?? "low",
    missingHints: data.missingHints ?? [],
  }
}
