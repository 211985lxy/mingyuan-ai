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
  activeAgentId: AimAgentId
}

/**
 * Parse and validate AIM workbench URL search parameters.
 *
 * Extracts all query-string fields used by the AIM page, with safe defaults
 * and validation for agent ID and topic index.
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
    activeAgentId,
  }
}
