/**
 * 「新任务」应切断的 URL 任务态：历史稿、选题预填、对标素材、流程 stage。
 * 保留 agent / project / mode，避免误切客户或快速出稿模式。
 */
export const AIM_TASK_SCOPED_SEARCH_PARAM_KEYS = [
  "generationId",
  "topicTitle",
  "topicRationale",
  "topicSelectionId",
  "selectedTopicIndex",
  "videoCopyExtractionId",
  "idea",
  "stage",
] as const

/**
 * 从 search params 剥离任务级上下文。返回是否有改动。
 */
export function stripAimTaskScopedSearchParams(params: URLSearchParams): boolean {
  let changed = false
  for (const key of AIM_TASK_SCOPED_SEARCH_PARAM_KEYS) {
    if (!params.has(key)) continue
    params.delete(key)
    changed = true
  }
  return changed
}

/**
 * 空会话不应再沿用上一任务的选题/对标/流程 brief。
 * startsNewTask 为显式隔离；无历史消息时同样视为新任务上下文。
 */
export function shouldKeepAimFollowUpContext(
  startsNewTask: boolean | undefined,
  historyMessageCount: number,
): boolean {
  if (startsNewTask) return false
  return historyMessageCount > 0
}

/**
 * 流程 brief：显式 override（计划确认）优先；否则仅在 keepContext 时沿用当前 brief。
 * 避免「出一篇新主题」仍挂着上一任务的 sourceGenerationId / confirmed。
 */
export function resolveAimWorkflowBriefForRequest<T>(input: {
  keepContext: boolean
  currentBrief: T | null | undefined
  override?: T | null
}): T | null {
  if (input.override !== undefined) return input.override
  if (!input.keepContext) return null
  return input.currentBrief ?? null
}
