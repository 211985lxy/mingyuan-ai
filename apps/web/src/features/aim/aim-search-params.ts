import { isValidAimAgent, DEFAULT_AIM_AGENT, type AimAgentId } from "@/lib/aim-ui-config"

/** Parsed AIM page URL search parameters. */
export interface AimSearchParams {
  agentParam: string | null
  workflowStageParam: string | null
  topicTitleParam: string | null
  topicRationaleParam: string | null
  topicSelectionIdParam: string | null
  selectedTopicIndexParam: number
  projectIdParam: string | null
  videoCopyExtractionIdParam: string | null
  modeParam: string | null
  ideaParam: string | null
  generationIdParam: string | null
  activeAgentId: AimAgentId
}

/**
 * Parse and validate AIM workbench URL search parameters.
 *
 * Extracts all query-string fields used by the AIM page, with safe defaults
 * and validation for agent ID and topic index.
 */
/**
 * @description 解析aimsearchparams
 * @param searchParams - URL 搜索参数
 * @returns AimSearchParams
 */
export function parseAimSearchParams(searchParams: URLSearchParams): AimSearchParams {
  const agentParam = searchParams.get("agent")
  const workflowStageParam = searchParams.get("stage")
  const topicTitleParam = searchParams.get("topicTitle")
  const topicRationaleParam = searchParams.get("topicRationale")
  const topicSelectionIdParam = searchParams.get("topicSelectionId")

  // selectedTopicIndex: only parse if the param exists and is a non-negative integer.
  // Number(null) === 0 would incorrectly treat "no selection" as index 0.
  const selectedTopicIndexRaw = searchParams.get("selectedTopicIndex")
  const selectedTopicIndexParam =
    selectedTopicIndexRaw !== null && /^\d+$/.test(selectedTopicIndexRaw)
      ? Number(selectedTopicIndexRaw)
      : NaN

  const projectIdParam = searchParams.get("projectId")
  const videoCopyExtractionIdParam = searchParams.get("videoCopyExtractionId")
  const modeParam = searchParams.get("mode")
  const ideaParam = searchParams.get("idea")
  const generationIdRaw = searchParams.get("generationId")
  const generationIdParam = generationIdRaw && /^[A-Za-z0-9_-]{1,64}$/.test(generationIdRaw)
    ? generationIdRaw
    : null

  const activeAgentId: AimAgentId = isValidAimAgent(agentParam) ? agentParam : DEFAULT_AIM_AGENT

  return {
    agentParam,
    workflowStageParam,
    topicTitleParam,
    topicRationaleParam,
    topicSelectionIdParam,
    selectedTopicIndexParam,
    projectIdParam,
    videoCopyExtractionIdParam,
    modeParam,
    ideaParam,
    generationIdParam,
    activeAgentId,
  }
}
