"use client"

import { useCallback, useState, type Dispatch, type SetStateAction } from "react"
import type { AimComposerMode } from "@/components/aim/aim-prompt-composer"
import { useAimPlanSession } from "@/features/aim/hooks/use-aim-plan-session"
import type { AimWorkflowBriefState } from "@/hooks/use-aim-generation-actions"
import {
  parseExplicitDirectModeCommand,
  parseExplicitPlanModeCommand,
} from "@/lib/aim/plan-mode-command"

interface UseAimPlanOrchestrationInput {
  input: string
  setInput: (value: string) => void
  selectedProjectId: string
  projectEnabled: boolean
  setWorkflowBrief: Dispatch<SetStateAction<AimWorkflowBriefState | null>>
  generateWithInput: (input: string, options?: {
    startsNewTask?: boolean
    workflowBriefOverride?: AimWorkflowBriefState | null
  }) => unknown
}

/** 计划模式编排：仅管理计划会话与生成入口，不承载 AIM 工作台其它状态。 */
export function useAimPlanOrchestration(input: UseAimPlanOrchestrationInput) {
  const [composerMode, setComposerMode] = useState<AimComposerMode>("direct")
  const planSession = useAimPlanSession()
  const canUsePlanMode = input.projectEnabled && Boolean(input.selectedProjectId)

  const handleStartPlan = useCallback(async () => {
    const requirement = input.input.trim()
    if (!requirement || !input.selectedProjectId) return
    input.setInput("")
    await planSession.startPlan(requirement, input.selectedProjectId)
  }, [input, planSession])

  const handlePlanConfirm = useCallback(() => {
    const brief = planSession.confirmPlan()
    if (!brief) return
    const briefState: AimWorkflowBriefState = {
      nextInput: planSession.session?.requirement || "",
      confirmed: brief,
    }
    input.setWorkflowBrief(briefState)
    setComposerMode("direct")
    void input.generateWithInput(briefState.nextInput, {
      startsNewTask: true,
      workflowBriefOverride: briefState,
    })
  }, [input, planSession])

  const handlePlanAbandon = useCallback(() => {
    planSession.abandonPlan()
    setComposerMode("direct")
  }, [planSession])

  const handleGenerateOrPlan = useCallback((directGenerate: () => void) => {
    if (composerMode === "plan") {
      const directCommand = parseExplicitDirectModeCommand(input.input)
      if (directCommand.matched) {
        setComposerMode("direct")
        input.setInput(directCommand.remainingInput)
        return
      }
      void handleStartPlan()
      return
    }

    const planCommand = parseExplicitPlanModeCommand(input.input)
    if (planCommand.matched) {
      setComposerMode("plan")
      input.setInput(planCommand.remainingInput)
      return
    }
    directGenerate()
  }, [composerMode, handleStartPlan, input])

  return {
    composerMode,
    setComposerMode,
    canUsePlanMode,
    planSession,
    handlePlanConfirm,
    handlePlanAbandon,
    handleGenerateOrPlan,
  }
}
