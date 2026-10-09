/**
 * 网页上能点的动作清单。提示词仍以技能和引导文案为准，这里只做登记。
 */

import type { AimNextAction, AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import { getAimAgentGuide } from "@/lib/aim-agent-guides"
import { getWorkflowStageForAgent, AIM_WORKFLOW_STAGES, type AimWorkflowStage } from "@/lib/aim-workflow"
import { listVisibleAimAgents } from "@/lib/aim-ui-config"
import type { AimAgentId } from "@/lib/aim-harness/contracts"

export const PAGE_ACTION_REFUSALS = {
  publish: "不允许自动发布。真正发出去要人在页面上确认。",
  feishu_write: "不允许写入飞书。这一版只在 AIM 里留草稿。",
  knowledge_edit: "不允许修改知识库。",
  ip_plan_edit: "不允许修改 IP 营销全案。",
} as const

export type AimPageActionMode = "run" | "refuse" | "page_only"

export interface AimPageAction {
  toolName: string
  title: string
  description: string
  stage: AimWorkflowStage
  agentId?: AimAgentId
  mode: AimPageActionMode
  skill?: AimWorkbenchSkill
  prompt?: string
  refusal?: string
  materialNoun: "成稿" | "素材"
}

const STAGE_TITLE = Object.fromEntries(AIM_WORKFLOW_STAGES.map((stage) => [stage.id, stage.title])) as Record<AimWorkflowStage, string>

export function listAimPageActions(): AimPageAction[] {
  const actions: AimPageAction[] = []
  const seen = new Set<string>()
  for (const agent of listVisibleAimAgents()) {
    const guide = getAimAgentGuide(agent.id)
    for (const skill of guide.skills) pushAction(actions, seen, skillAction(agent.id, skill))
    for (const next of guide.nextActions) pushAction(actions, seen, nextAction(agent.id, next))
  }
  for (const action of forbiddenActions()) pushAction(actions, seen, action)
  return actions
}

export function stageTitle(stage: AimWorkflowStage) {
  return STAGE_TITLE[stage]
}

function pushAction(actions: AimPageAction[], seen: Set<string>, action: AimPageAction) {
  if (seen.has(action.toolName)) return
  seen.add(action.toolName)
  actions.push(action)
}

function skillAction(agentId: AimAgentId, skill: AimWorkbenchSkill): AimPageAction {
  const resolvedAgent = (skill.agentId || agentId) as AimAgentId
  if (skill.workbenchAction || !skill.prompt.trim()) {
    return baseAction(resolvedAgent, `aim_${skill.id}`, skill.label, pageOnlyMessage(skill.label), "page_only")
  }
  return { ...baseAction(resolvedAgent, `aim_${skill.id}`, skill.label, skill.description, "run"), skill }
}

function nextAction(agentId: AimAgentId, next: AimNextAction): AimPageAction {
  if (next.id === "save_knowledge") return refusalAction("aim_knowledge_edit", "保存为档案素材", PAGE_ACTION_REFUSALS.knowledge_edit)
  if (next.workbenchAction === "generate_digital_human_video") {
    return baseAction(agentId, "aim_generate_digital_human_video", next.label, pageOnlyMessage(next.label), "page_only")
  }
  const target = (next.targetAgentId || agentId) as AimAgentId
  if (target === "content_producer" && getWorkflowStageForAgent(agentId) === "direction") {
    return baseAction(target, `aim_${agentId}__${next.id}`, next.label, pageOnlyMessage(next.label), "page_only")
  }
  return {
    ...baseAction(target, `aim_${agentId}__${next.id}`, next.label, next.prompt.slice(0, 80), "run"),
    prompt: next.prompt,
  }
}

function forbiddenActions(): AimPageAction[] {
  return [
    refusalAction("aim_publish", "自动发布", PAGE_ACTION_REFUSALS.publish),
    refusalAction("aim_feishu_write", "写入飞书", PAGE_ACTION_REFUSALS.feishu_write),
    refusalAction("aim_knowledge_edit", "修改知识库", PAGE_ACTION_REFUSALS.knowledge_edit),
    refusalAction("aim_ip_plan_edit", "修改 IP 营销全案", PAGE_ACTION_REFUSALS.ip_plan_edit),
  ]
}

function refusalAction(toolName: string, title: string, refusal: string): AimPageAction {
  return {
    toolName,
    title,
    description: refusal,
    stage: "publish",
    mode: "refuse",
    refusal,
    materialNoun: "成稿",
  }
}

function baseAction(
  agentId: AimAgentId,
  toolName: string,
  title: string,
  description: string,
  mode: AimPageActionMode,
): AimPageAction {
  const stage = getWorkflowStageForAgent(agentId)
  const noun = stage === "publish" ? "成稿" : "素材"
  return {
    toolName,
    title,
    description: `${stageTitle(stage)} · ${description}`,
    stage,
    agentId,
    mode,
    materialNoun: noun,
    ...(mode === "page_only" ? { refusal: description.startsWith("「") ? description : pageOnlyMessage(title) } : {}),
  }
}

function pageOnlyMessage(label: string) {
  return `「${label}」要在网页里打开对应面板或确认单才能做。MCP 不会编一个结果假装做完。`
}
