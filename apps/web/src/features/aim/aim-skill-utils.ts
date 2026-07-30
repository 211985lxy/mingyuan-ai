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
import { isValidAimAgent, normalizeAimAgentId } from "@/lib/aim-harness/contracts"

export interface AimAgentOption extends AimAgentMeta, AimAgentGuide {}

/** Pre-compute agent metadata + guide for each available agent. */
export const AGENT_OPTIONS: AimAgentOption[] = AIM_AGENT_OPTIONS.map((meta) => ({
  ...meta,
  ...getAimAgentGuide(meta.id),
}))

/** Build the prompt for a workbench skill, prepending context if available. */
/**
 * @description 构建skillprompt
 * @param skill - 技能
 * @param context - 上下文
 * @returns string
 */

/** 技能 prompt 中常见的上下文引用短语（命中则不再拼接前缀） */
const CONTEXT_REFS = [
  "当前内容", "当前文案", "当前素材", "当前业务", "当前热点",
  "当前信息", "当前人设", "当前核心", "当前选题", "当前会议",
  "当前对标", "当前商业模式", "当前来时路", "当前人设故事",
]

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
  const alreadyRefsContext = CONTEXT_REFS.some((ref) => skill.prompt.includes(ref))
  return hasCurrentContext && !alreadyRefsContext
    ? `请基于当前内容，${skill.prompt.replace(/^请/, "")}`
    : skill.prompt
}

/**
 * 解析技能应该由哪个引擎执行。
 *
 * 返回 undefined 表示"不用委托"：请求不带 executionAgentId，服务端行为与今天完全一致。
 * 非法 / 未知 agent 一律回落到不委托，绝不落到默认智能体造成串台。
 *
 * @description 解析技能执行引擎
 * @param skill - 工作台技能
 * @param currentAgentId - 当前会话智能体（可缺省；服务端会用请求里的会话 agentId 再判一次）
 * @returns string | undefined
 */
export function resolveSkillExecutionAgentId(
  skill: Pick<AimWorkbenchSkill, "agentId">,
  currentAgentId?: string,
): string | undefined {
  if (!isValidAimAgent(skill.agentId)) return undefined
  const executionAgentId = normalizeAimAgentId(skill.agentId)
  if (currentAgentId && executionAgentId === normalizeAimAgentId(currentAgentId)) return undefined
  return executionAgentId
}
