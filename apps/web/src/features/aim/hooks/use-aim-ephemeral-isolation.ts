"use client"

import { useCallback } from "react"
import type { Dispatch, SetStateAction } from "react"

import type { AimContentAction, ConfirmedWorkflowBrief } from "@/lib/aim-workflow"
import type { AimWorkflowBriefState } from "@/hooks/use-aim-generation-actions"
import {
  clearAimWorkbenchEphemeralState,
  isolateAimTaskSessionExtras,
} from "@/features/aim/hooks/run-aim-workbench-new-task-reset"

/** 工作台会话附属态清理：切 agent / 软隔离新任务共用。 */
export function useAimEphemeralIsolation(input: {
  clearSelections: () => void
  clearImages: () => void
  setWorkflowBrief: Dispatch<SetStateAction<AimWorkflowBriefState | null>>
  setWorkflowBriefForm: Dispatch<SetStateAction<ConfirmedWorkflowBrief>>
  setWorkflowBriefDialogOpen: Dispatch<SetStateAction<boolean>>
  setContentAction: Dispatch<SetStateAction<AimContentAction | null>>
  searchParams: { toString: () => string }
  router: { replace: (href: string) => void }
}) {
  const clearAgentSwitchEphemeral = useCallback(() => {
    clearAimWorkbenchEphemeralState({
      clearSelections: input.clearSelections,
      clearImages: input.clearImages,
      setWorkflowBrief: input.setWorkflowBrief,
      setWorkflowBriefForm: input.setWorkflowBriefForm,
      setWorkflowBriefDialogOpen: input.setWorkflowBriefDialogOpen,
      setContentAction: input.setContentAction,
    })
  }, [input.clearImages, input.clearSelections, input.setContentAction, input.setWorkflowBrief, input.setWorkflowBriefDialogOpen, input.setWorkflowBriefForm])

  const isolateTaskSessionExtras = useCallback(() => {
    isolateAimTaskSessionExtras({
      clearSelections: input.clearSelections,
      setWorkflowBrief: input.setWorkflowBrief,
      setWorkflowBriefForm: input.setWorkflowBriefForm,
      setWorkflowBriefDialogOpen: input.setWorkflowBriefDialogOpen,
      setContentAction: input.setContentAction,
      searchParams: input.searchParams,
      router: input.router,
    })
  }, [input.clearSelections, input.router, input.searchParams, input.setContentAction, input.setWorkflowBrief, input.setWorkflowBriefDialogOpen, input.setWorkflowBriefForm])

  return { clearAgentSwitchEphemeral, isolateTaskSessionExtras }
}
