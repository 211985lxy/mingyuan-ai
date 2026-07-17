import {
  AIM_AGENT_OPTIONS,
  type AimAgentMeta,
} from "@/lib/aim-ui-config"
import {
  getAimAgentGuide,
  type AimAgentGuide,
  type AimWorkbenchSkill,
} from "@/lib/aim-agent-guides"
import type { AimWorkbenchMessage as ChatMessage } from "@/lib/aim/workbench-types"

export interface AimAgentOption extends AimAgentMeta, AimAgentGuide {}

/** Pre-compute agent metadata + guide for each available agent. */
export const AGENT_OPTIONS: AimAgentOption[] = AIM_AGENT_OPTIONS.map((meta) => ({
  ...meta,
  ...getAimAgentGuide(meta.id),
}))

/** Build the prompt for a workbench skill, prepending context if available. */
export function buildSkillPrompt(skill: AimWorkbenchSkill, context: {
  editorText: string
  sourceOriginalText: string
  sourceAnalysisText: string
  sourceTopicTitle: string
  messages: ChatMessage[]
}): string {
  const hasCurrentContext = Boolean(
    context.editorText.trim() || context.sourceOriginalText.trim() || context.sourceAnalysisText.trim()
    || context.sourceTopicTitle.trim()
    || context.messages.some((message) => message.role === "assistant" && (message.content.trim() || message.deliverables)),
  )
  return hasCurrentContext && !skill.prompt.includes("当前")
    ? `请基于当前内容，${skill.prompt.replace(/^请/, "")}`
    : skill.prompt
}
