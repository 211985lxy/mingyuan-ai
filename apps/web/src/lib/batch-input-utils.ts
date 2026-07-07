/** 分批建议阈值（字符数） */
export const BATCH_INPUT_THRESHOLD = 3000

export interface BatchSuggestion {
  shouldSuggest: boolean
  charCount: number
  message: string
}

export function shouldSuggestBatch(text: string): boolean {
  return text.length > BATCH_INPUT_THRESHOLD
}

export function getBatchSuggestion(text: string): BatchSuggestion {
  if (!shouldSuggestBatch(text)) {
    return { shouldSuggest: false, charCount: text.length, message: "" }
  }
  const estimatedChunks = Math.ceil(text.length / BATCH_INPUT_THRESHOLD)
  return {
    shouldSuggest: true,
    charCount: text.length,
    message: `输入内容较长（${text.length} 字），建议分 ${estimatedChunks} 批发送。发送后可继续输入下一批，最后说"开始整理"或直接发送指令即可。`,
  }
}
