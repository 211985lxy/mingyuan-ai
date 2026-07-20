"use client"

import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { toast } from "sonner"

import { createAimWorkflowBrief, createKnowledge } from "@/lib/api/client"
import {
  AIM_CONTENT_ACTIONS,
  AIM_WORKFLOW_STAGES,
  getWorkflowStageForAgent,
  type AimContentAction,
  type AimWorkflowStage,
  type ConfirmedWorkflowBrief,
} from "@/lib/aim-workflow"
import type { AimAgentId } from "@/lib/aim-ui-config"
import { buildAimNextActionPrompt, type AimNextAction } from "@/lib/aim-agent-guides"
import type { AimWorkflowBriefState } from "@/hooks/use-aim-generation-actions"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

type StringSetter = Dispatch<SetStateAction<string>>

interface AimWorkflowActionInput {
  searchParams: { toString: () => string }
  router: { replace: (href: string) => void }
  lastAgentParamRef: MutableRefObject<string | null>
  selectedAgentId: AimAgentId
  selectedProjectId: string
  agentTitle: string
  workflowBrief: AimWorkflowBriefState | null
  workflowBriefForm: ConfirmedWorkflowBrief
  setSelectedAgentId: Dispatch<SetStateAction<AimAgentId>>
  setMessages: Dispatch<SetStateAction<AimWorkbenchMessage[]>>
  setInput: StringSetter
  setContentAction: Dispatch<SetStateAction<AimContentAction | null>>
  setWorkflowBrief: Dispatch<SetStateAction<AimWorkflowBriefState | null>>
  setWorkflowBriefForm: Dispatch<SetStateAction<ConfirmedWorkflowBrief>>
  setWorkflowBriefDialogOpen: Dispatch<SetStateAction<boolean>>
  setIsBuildingWorkflowBrief: Dispatch<SetStateAction<boolean>>
  clearCurrentTaskContext: () => void
}

function beginWorkflowStage(input: AimWorkflowActionInput, stage: AimWorkflowStage) {
  const config = AIM_WORKFLOW_STAGES.find((item) => item.id === stage)!
  const params = new URLSearchParams(input.searchParams.toString())
  params.set("stage", stage)
  params.set("agent", config.defaultAgentId)
  input.lastAgentParamRef.current = config.defaultAgentId
  input.setSelectedAgentId(config.defaultAgentId)
  if (stage !== "content") input.setContentAction(null)
  if (stage === "results") input.setInput("请基于已发布内容填写复盘：结果、判断和下一轮可复用规则。")
  input.router.replace(`/aim?${params.toString()}`)
}

function beginContentAction(input: AimWorkflowActionInput, action: AimContentAction) {
  const config = AIM_CONTENT_ACTIONS.find((item) => item.id === action)!
  input.setContentAction(action)
  input.setInput((current) => current.trim() ? `${config.prompt}\n\n${current}` : config.prompt)
  if (input.selectedAgentId !== "content_producer") beginWorkflowStage(input, "content")
}

async function saveNextActionKnowledge(input: AimWorkflowActionInput, action: AimNextAction, content: string) {
  if (!input.selectedProjectId) return toast.error("请先选择 IP 营销全案")
  try {
    await createKnowledge({
      projectId: input.selectedProjectId,
      category: "positioning_material",
      title: `AIM交付物 · ${input.agentTitle}`,
      content,
      tags: ["aim_delivery", action.id],
      sourceType: "manual",
    })
    toast.success("已保存为档案素材")
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "保存失败")
  }
}

async function openWorkflowBrief(input: AimWorkflowActionInput, action: AimNextAction, content: string, generationId: string) {
  input.setIsBuildingWorkflowBrief(true)
  try {
    const brief = await createAimWorkflowBrief({
      stage: "content",
      projectId: input.selectedProjectId || undefined,
      sourceGenerationId: generationId,
      goal: action.label,
    })
    input.setWorkflowBriefForm({
      goal: brief.taskSpec.goal,
      targetCustomer: brief.taskSpec.targetCustomer,
      realProblem: brief.taskSpec.realProblem,
      contentTask: brief.taskSpec.contentTask,
      mustKeep: brief.taskSpec.exclusiveEvidence,
      desiredAction: brief.taskSpec.desiredAction,
    })
    input.setWorkflowBrief({ sourceGenerationId: brief.sourceGenerationId, nextInput: buildAimNextActionPrompt(action, content), confirmed: {} })
    input.setWorkflowBriefDialogOpen(true)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "任务单创建失败")
  } finally {
    input.setIsBuildingWorkflowBrief(false)
  }
}

function switchToTargetAgent(input: AimWorkflowActionInput, targetAgentId: AimAgentId) {
  const params = new URLSearchParams(input.searchParams.toString())
  params.set("agent", targetAgentId)
  params.set("stage", getWorkflowStageForAgent(targetAgentId))
  input.lastAgentParamRef.current = targetAgentId
  input.setSelectedAgentId(targetAgentId)
  input.setMessages([])
  input.clearCurrentTaskContext()
  input.router.replace(`/aim?${params.toString()}`)
}

async function handleAimNextAction(input: AimWorkflowActionInput, action: AimNextAction, content: string, generationId: string) {
  const cleanContent = content.trim()
  if (!cleanContent) return
  if (action.id === "save_knowledge") return void await saveNextActionKnowledge(input, action, cleanContent)
  if (action.targetAgentId && action.targetAgentId !== input.selectedAgentId) {
    if (action.targetAgentId === "content_producer" && getWorkflowStageForAgent(input.selectedAgentId) === "direction") {
      await openWorkflowBrief(input, action, cleanContent, generationId)
      return
    }
    switchToTargetAgent(input, action.targetAgentId)
  }
  input.setInput(buildAimNextActionPrompt(action, cleanContent))
  toast.success("已带入聊天框")
}

function closeWorkflowBrief(input: AimWorkflowActionInput) {
  input.setWorkflowBriefDialogOpen(false)
  input.setWorkflowBrief(null)
}

function confirmWorkflowBrief(input: AimWorkflowActionInput) {
  if (!input.workflowBrief) return
  const params = new URLSearchParams(input.searchParams.toString())
  params.set("agent", "content_producer")
  params.set("stage", "content")
  input.lastAgentParamRef.current = "content_producer"
  input.setSelectedAgentId("content_producer")
  input.setWorkflowBrief({ ...input.workflowBrief, confirmed: input.workflowBriefForm })
  input.setWorkflowBriefDialogOpen(false)
  input.setInput(input.workflowBrief.nextInput)
  input.router.replace(`/aim?${params.toString()}`)
  toast.success("任务单已确认，开始内容创作")
}

/**
 * @description React Hook：aimworkflowactions
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimWorkflowActions(input: AimWorkflowActionInput) {
  return {
    beginWorkflowStage: (stage: AimWorkflowStage) => beginWorkflowStage(input, stage),
    beginContentAction: (action: AimContentAction) => beginContentAction(input, action),
    handleAimNextAction: (action: AimNextAction, content: string, generationId: string) => handleAimNextAction(input, action, content, generationId),
    closeWorkflowBriefDialog: () => closeWorkflowBrief(input),
    confirmWorkflowBrief: () => confirmWorkflowBrief(input),
  }
}
