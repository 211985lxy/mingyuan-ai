import type { ContentFormat } from "@/lib/api/client"
import { clampEditorPanelWidth } from "@/lib/aim-editor"
import { isValidAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import type { AimDraft } from "@/features/aim/aim-workbench-types"

const AIM_DRAFT_STORAGE_KEY_PREFIX = "aim-workbench-draft-v2"

export function aimDraftStorageKey(agentId: AimAgentId) {
  return `${AIM_DRAFT_STORAGE_KEY_PREFIX}:${agentId}`
}

export function loadAimDraft(agentId: AimAgentId): AimDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(aimDraftStorageKey(agentId))
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<AimDraft>
    if (!isValidAimAgent(draft.selectedAgentId) || !Array.isArray(draft.messages)) return null
    return {
      selectedAgentId: draft.selectedAgentId,
      selectedProjectId: typeof draft.selectedProjectId === "string" ? draft.selectedProjectId : "",
      input: typeof draft.input === "string" ? draft.input : "",
      messages: draft.messages,
      videoCopyExtractionId: typeof draft.videoCopyExtractionId === "string" ? draft.videoCopyExtractionId : undefined,
      sourceOriginalText: typeof draft.sourceOriginalText === "string" ? draft.sourceOriginalText : undefined,
      sourceAnalysisText: typeof draft.sourceAnalysisText === "string" ? draft.sourceAnalysisText : undefined,
      sourceTopicTitle: typeof draft.sourceTopicTitle === "string" ? draft.sourceTopicTitle : undefined,
      sourceTopicRationale: typeof draft.sourceTopicRationale === "string" ? draft.sourceTopicRationale : undefined,
      editorText: typeof draft.editorText === "string" ? draft.editorText : undefined,
      editorFormat: typeof draft.editorFormat === "string" ? draft.editorFormat as ContentFormat : undefined,
      editorSourceMessageId: typeof draft.editorSourceMessageId === "string" ? draft.editorSourceMessageId : undefined,
      editorPanelWidth: typeof draft.editorPanelWidth === "number" ? clampEditorPanelWidth(draft.editorPanelWidth) : undefined,
      editorPanelOpen: typeof draft.editorPanelOpen === "boolean" ? draft.editorPanelOpen : undefined,
    }
  } catch {
    return null
  }
}

export function saveAimDraft(draft: AimDraft) {
  if (typeof window === "undefined") return
  try {
    const storageKey = aimDraftStorageKey(draft.selectedAgentId)
    if (
      !draft.input.trim()
      && draft.messages.length === 0
      && !draft.editorText?.trim()
      && !draft.sourceOriginalText?.trim()
      && !draft.sourceAnalysisText?.trim()
      && !draft.sourceTopicTitle?.trim()
      && !draft.sourceTopicRationale?.trim()
    ) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft))
  } catch {}
}
