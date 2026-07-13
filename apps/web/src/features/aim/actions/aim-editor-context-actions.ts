import { toast } from "sonner"
import { applySelectionReplacement, extractReplacementDraft, type AimEditorContext } from "@/lib/aim-editor"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"
import type { AimEditorActionsOptions } from "@/features/aim/hooks/aim-editor-action-contracts"

export function createAimEditorContextActions(options: AimEditorActionsOptions) {
  function buildEditorContext(action: string): AimEditorContext {
    return {
      action,
      referenceSelection: options.referenceSelection.text.trim() || undefined,
      draftSelection: options.draftSelection.text.trim() || undefined,
      draftText: options.editorText.trim() || undefined,
      documentType: options.editorPanelLabels.documentType,
      referenceLabel: options.editorPanelLabels.referenceTitle,
      draftLabel: options.editorPanelLabels.draftTitle,
    }
  }

  function applyEditorReplacement(message: ChatMessage) {
    const replacement = extractReplacementDraft(message.content)
    const range = message.editorApply?.range
    if (!replacement || !range) return
    options.setEditorText((current) => applySelectionReplacement(current, range, replacement))
    toast.success("已应用到右侧选区")
  }

  return { buildEditorContext, applyEditorReplacement }
}
