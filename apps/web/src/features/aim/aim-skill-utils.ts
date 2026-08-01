import {
  AIM_AGENT_OPTIONS,
  type AimAgentMeta,
} from "@/lib/aim-ui-config"
import {
  getAimAgentGuide,
  type AimAgentGuide,
  type AimWorkbenchSkill,
} from "@/lib/aim-agent-guides"
import { CONTENT_PRODUCER_SKILLS } from "@/lib/aim-agent-skills"
import type { AimWorkbenchMessage as ChatMessage } from "@/lib/aim/workbench-types"
import { isValidAimAgent, normalizeAimAgentId } from "@/lib/aim-harness/contracts"

/** 内容目的技能的分组标识（与 aim-add-menu-panel-purposes 中的常量保持一致，避免从组件文件引入）。 */
const CONTENT_PURPOSE_GROUP = "内容目的"

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

/**
 * 计算技能按钮点击后应填入输入框的文本：
 * 内容目的技能走互斥替换（只留一个目的锚点，保留用户正文）；其它技能走原有「前置拼接」。
 * 抽成纯函数，便于单测并控制 hook 体长。
 */
export function resolveSkillInputText(input: {
  skill: AimWorkbenchSkill
  prompt: string
  currentInput: string
}): string {
  const replaced = applyContentPurposeSkill({
    skill: input.skill,
    newPrompt: input.prompt,
    currentInput: input.currentInput,
  })
  if (replaced !== null) return replaced
  const text = input.currentInput.trim()
  return text ? `${input.prompt}\n\n---\n${text}\n---` : input.prompt
}

/** planWorkbenchSkillApply 需要的上下文字段（与 useAimSendActions 的 options 形状兼容）。 */
export interface WorkbenchSkillContext {
  selectedAgentId?: string
  editorText: string
  sourceOriginalText: string
  sourceAnalysisText: string
  sourceTopicTitle: string
  messages: ChatMessage[]
  input: string
}

/**
 * 应用一条工作台技能：算出 prompt、解析委托引擎、并算出应填入输入框的文本。
 * 纯函数，无副作用——hook 只负责据此更新 ref 与 state。
 */
export function planWorkbenchSkillApply(
  context: WorkbenchSkillContext,
  skill: AimWorkbenchSkill,
): {
  prompt: string
  nextInput: string
  /** 待登记的一次性委托意图（executionAgentId 缺省时为 null）。 */
  delegation: { prompt: string; executionAgentId: string } | null
} {
  const prompt = buildSkillPrompt(skill, {
    editorText: context.editorText,
    sourceOriginalText: context.sourceOriginalText,
    sourceAnalysisText: context.sourceAnalysisText,
    sourceTopicTitle: context.sourceTopicTitle,
    messages: context.messages,
  })
  const executionAgentId = resolveSkillExecutionAgentId(skill, context.selectedAgentId)
  const nextInput = resolveSkillInputText({ skill, prompt, currentInput: context.input })
  return {
    prompt,
    nextInput,
    delegation: executionAgentId ? { prompt, executionAgentId } : null,
  }
}

/**
 * 把一条内容目的技能的 prompt「替换式」填入输入框文本：
 * 先剥离文本里任何已存在的（其它）内容目的锚点段，再把新 prompt 放在最前，
 * 用户自己输入的正文原样保留在后。三个目的（流量/获客/故事）互斥，输入框始终只有一个目的锚点。
 *
 * 返回 null 表示该技能不是内容目的，调用方应走原有「前置拼接」逻辑。
 *
 * @description 内容目的技能互斥替换
 */
export function applyContentPurposeSkill(input: {
  skill: AimWorkbenchSkill
  newPrompt: string
  currentInput: string
}): string | null {
  if (input.skill.group !== CONTENT_PURPOSE_GROUP) return null
  const knownPrompts = collectKnownContentPurposePrompts()
  const cleaned = stripContentPurposeSegments(input.currentInput, knownPrompts)
  // 剥离后开头可能残留空行；用户正文（含其原有的 --- 引用块）整体保留在后。
  const userText = cleaned.replace(/^[\s\n]+/, "").trim()
  return userText ? `${input.newPrompt}\n\n---\n${userText}\n---` : input.newPrompt
}

/** 收集所有内容目的技能的 prompt 文本（含「请基于当前内容，」前缀形态），用于剥离识别。 */
function collectKnownContentPurposePrompts(): string[] {
  const prompts: string[] = []
  for (const skill of CONTENT_PRODUCER_SKILLS) {
    if (skill.group !== CONTENT_PURPOSE_GROUP) continue
    prompts.push(skill.prompt)
    const alreadyRefsContext = CONTEXT_REFS.some((ref) => skill.prompt.includes(ref))
    if (!alreadyRefsContext) {
      prompts.push(`请基于当前内容，${skill.prompt.replace(/^请/, "")}`)
    }
  }
  return prompts
}

/** 从输入文本中移除任何已知内容目的 prompt 段（连点多次会叠加多段，逐个剥离）。 */
function stripContentPurposeSegments(text: string, knownPrompts: string[]): string {
  // 按长度降序匹配，避免短 prompt 是长 prompt 的前缀时误吞尾部。
  const sorted = [...knownPrompts].sort((a, b) => b.length - a.length)
  let result = text
  for (const prompt of sorted) {
    let idx = result.indexOf(prompt)
    while (idx !== -1) {
      result = result.slice(0, idx) + result.slice(idx + prompt.length)
      idx = result.indexOf(prompt)
    }
  }
  return result
}
