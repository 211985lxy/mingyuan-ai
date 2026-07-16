"use client"

import { createAimEditorContextActions } from "@/features/aim/actions/aim-editor-context-actions"
import { createAimOpeningAction, createAimDraftRevisionAction } from "@/features/aim/actions/aim-editor-generation-actions"
import { createAimEditorTransferActions } from "@/features/aim/actions/aim-editor-transfer-actions"
import { createAimWorkbenchCommandRunner } from "@/features/aim/actions/aim-workbench-command-runner"
import type { AimEditorActionsOptions } from "@/features/aim/hooks/aim-editor-action-contracts"
import { useAimImitateAction } from "@/features/aim/hooks/use-aim-imitate-action"

export function useAimEditorActions(options: AimEditorActionsOptions) {
  const imitate = useAimImitateAction(options)
  const transfer = createAimEditorTransferActions(options)
  const editorContext = createAimEditorContextActions(options)
  const optimizeOpening = createAimOpeningAction(options)
  const reviseDraft = createAimDraftRevisionAction(options, editorContext.buildEditorContext)
  const runWorkbenchCommand = createAimWorkbenchCommandRunner(options, {
    integrateEditor: transfer.integrateLatestAssistantDraftToEditor,
    fillReference: transfer.fillReferenceTextFromConversation,
    saveEditor: transfer.saveEditorToDeliverable,
    reviseDraft,
    optimizeOpening,
  })

  return {
    ...imitate,
    saveEditorToDeliverable: transfer.saveEditorToDeliverable,
    runWorkbenchCommand,
    buildEditorContext: editorContext.buildEditorContext,
    applyEditorReplacement: editorContext.applyEditorReplacement,
  }
}
