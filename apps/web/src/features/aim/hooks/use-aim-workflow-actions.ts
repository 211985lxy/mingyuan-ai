"use client"

import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { toast } from "sonner"

import {
  AIM_CONTENT_ACTIONS,
  AIM_WORKFLOW_STAGES,
  getWorkflowStageForAgent,
  type AimContentAction,
  type AimWorkflowStage,
  type ConfirmedWorkflowBrief,
} from "@/lib/aim-workflow"
import { buildAimNextActionPrompt, type AimNextAction } from "@/lib/aim-agent-guides"
import {
  createAimWorkflowBrief,
  createKnowledge,
  type ContentFormat,
} from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"

interface UseAimWorkflowActionsOptions {
  searchParams: URLSearchParams
  selectedAgentId: AimAgentId
  selectedProjectId: string
  agentTitle: string
  lastAgentParamRef: MutableRefObject<string | null>
  replaceAimUrl: (url: string) => void
  setSelectedAgentId: Dispatch<SetStateAction<AimAgentId>>
  setInput: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setSourceVideoCopyExtractionId: Dispatch<SetStateAction<string | undefined>>
  setSourceOriginalText: Dispatch<SetStateAction<string>>
  setSourceAnalysisText: Dispatch<SetStateAction<string>>
  setSourceTopicTitle: Dispatch<SetStateAction<string>>
  setSourceTopicRationale: Dispatch<SetStateAction<string>>
  setEditorText: Dispatch<SetStateAction<string>>
  setEditorFormat: Dispatch<SetStateAction<ContentFormat | undefined>>
  setEditorSourceMessageId: Dispatch<SetStateAction<string | undefined>>
}

export function useAimWorkflowActions({
  searchParams,
  selectedAgentId,
  selectedProjectId,
  agentTitle,
  lastAgentParamRef,
  replaceAimUrl,
  setSelectedAgentId,
  setInput,
  setMessages,
  setSourceVideoCopyExtractionId,
  setSourceOriginalText,
  setSourceAnalysisText,
  setSourceTopicTitle,
  setSourceTopicRationale,
  setEditorText,
  setEditorFormat,
  setEditorSourceMessageId,
}: UseAimWorkflowActionsOptions) {
  const [workflowBrief, setWorkflowBrief] = useState<{
    sourceGenerationId?: string
    nextInput: string
    confirmed: ConfirmedWorkflowBrief
  } | null>(null)
  const [workflowBriefForm, setWorkflowBriefForm] = useState<ConfirmedWorkflowBrief>({})
  const [workflowBriefDialogOpen, setWorkflowBriefDialogOpen] = useState(false)
  const [isBuildingWorkflowBrief, setIsBuildingWorkflowBrief] = useState(false)
  const [contentAction, setContentAction] = useState<AimContentAction | null>(null)

  function beginWorkflowStage(stage: AimWorkflowStage) {
    const config = AIM_WORKFLOW_STAGES.find((item) => item.id === stage)!
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set("stage", stage)
    nextParams.set("agent", config.defaultAgentId)
    lastAgentParamRef.current = config.defaultAgentId
    setSelectedAgentId(config.defaultAgentId)
    if (stage !== "content") setContentAction(null)
    if (stage === "results") {
      setInput("请基于已发布内容填写复盘：结果、判断和下一轮可复用规则。")
    }
    replaceAimUrl(`/aim?${nextParams.toString()}`)
  }

  function beginContentAction(action: AimContentAction) {
    const config = AIM_CONTENT_ACTIONS.find((item) => item.id === action)!
    setContentAction(action)
    setInput((current) => current.trim() ? `${config.prompt}\n\n${current}` : config.prompt)
    if (selectedAgentId !== "content_producer") beginWorkflowStage("content")
  }

  async function handleAimNextAction(action: AimNextAction, content: string, generationId: string) {
    const cleanContent = content.trim()
    if (!cleanContent) return

    if (action.id === "save_knowledge") {
      if (!selectedProjectId) {
        toast.error("请先选择 IP 营销全案")
        return
      }
      try {
        await createKnowledge({
          projectId: selectedProjectId,
          category: "positioning_material",
          title: `AIM交付物 · ${agentTitle}`,
          content: cleanContent,
          tags: ["aim_delivery", action.id],
          sourceType: "manual",
        })
        toast.success("已保存为档案素材")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败")
      }
      return
    }

    if (action.targetAgentId && action.targetAgentId !== selectedAgentId) {
      if (action.targetAgentId === "content_producer" && getWorkflowStageForAgent(selectedAgentId) === "direction") {
        setIsBuildingWorkflowBrief(true)
        try {
          const brief = await createAimWorkflowBrief({
            stage: "content",
            projectId: selectedProjectId || undefined,
            sourceGenerationId: generationId,
            goal: action.label,
          })
          setWorkflowBriefForm({
            goal: brief.taskSpec.goal,
            targetCustomer: brief.taskSpec.targetCustomer,
            realProblem: brief.taskSpec.realProblem,
            contentTask: brief.taskSpec.contentTask,
            mustKeep: brief.taskSpec.exclusiveEvidence,
            desiredAction: brief.taskSpec.desiredAction,
          })
          setWorkflowBrief({
            sourceGenerationId: brief.sourceGenerationId,
            nextInput: buildAimNextActionPrompt(action, cleanContent),
            confirmed: {},
          })
          setWorkflowBriefDialogOpen(true)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "任务单创建失败")
        } finally {
          setIsBuildingWorkflowBrief(false)
        }
        return
      }
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.set("agent", action.targetAgentId)
      nextParams.set("stage", getWorkflowStageForAgent(action.targetAgentId))
      lastAgentParamRef.current = action.targetAgentId
      setSelectedAgentId(action.targetAgentId)
      setMessages([])
      setSourceVideoCopyExtractionId(undefined)
      setSourceOriginalText("")
      setSourceAnalysisText("")
      setSourceTopicTitle("")
      setSourceTopicRationale("")
      setEditorText("")
      setEditorFormat(undefined)
      setEditorSourceMessageId(undefined)
      replaceAimUrl(`/aim?${nextParams.toString()}`)
    }
    setInput(buildAimNextActionPrompt(action, cleanContent))
    toast.success("已带入聊天框")
  }

  function confirmWorkflowBrief() {
    const next = workflowBrief
    if (!next) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("agent", "content_producer")
    params.set("stage", "content")
    lastAgentParamRef.current = "content_producer"
    setSelectedAgentId("content_producer")
    setWorkflowBrief({ ...next, confirmed: workflowBriefForm })
    setWorkflowBriefDialogOpen(false)
    setInput(next.nextInput)
    replaceAimUrl(`/aim?${params.toString()}`)
    toast.success("任务单已确认，开始内容创作")
  }

  return {
    workflowBrief,
    setWorkflowBrief,
    workflowBriefForm,
    setWorkflowBriefForm,
    workflowBriefDialogOpen,
    setWorkflowBriefDialogOpen,
    isBuildingWorkflowBrief,
    contentAction,
    setContentAction,
    beginWorkflowStage,
    beginContentAction,
    handleAimNextAction,
    confirmWorkflowBrief,
  }
}
