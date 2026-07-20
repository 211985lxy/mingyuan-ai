export interface TopicPoolDraft {
  title: string
  content: string
}

/**
 * @description 构建topicpooldraftfromsearchparams
 * @param params - 参数对象
 * @returns TopicPoolDraft | null
 */
export function buildTopicPoolDraftFromSearchParams(
  params: URLSearchParams,
): TopicPoolDraft | null {
  const title = params.get("idea")?.trim()
  if (!title) return null

  const source = params.get("source")?.trim()
  const summary = params.get("summary")?.trim()
  const content = [
    source ? `来源：${source}` : null,
    summary ? `摘要：${summary}` : `热点：${title}`,
  ].filter(Boolean).join("\n")

  return { title, content }
}
