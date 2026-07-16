import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type { ContentFormat } from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { TextSelectionRange } from "@/lib/aim-editor"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"

export interface EditorSelectionState {
  text: string
  range: TextSelectionRange
}

export interface AimEditorActionsOptions {
  selectedAgentId: AimAgentId
  selectedProjectId: string
  projectEnabled: boolean
  messages: ChatMessage[]
  sourceOriginalText: string
  sourceAnalysisText: string
  sourceTopicTitle: string
  editorText: string
  editorFormat?: ContentFormat
  editorSourceMessageId?: string
  referenceSelection: EditorSelectionState
  draftSelection: EditorSelectionState
  editorPanelLabels: EditorPanelLabels
  agent: { defaultInstruction: string }
  requestAbortRef: MutableRefObject<AbortController | null>
  generateWithInput: (input: string) => void | Promise<void>
  handleQuality: (messageId: string) => () => Promise<void>
  resetConversation: () => void
  rememberWorkbenchPreference: (preference: string) => void
  setInput: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setEditorText: Dispatch<SetStateAction<string>>
  setEditorPanelOpen: Dispatch<SetStateAction<boolean>>
  setSourceOriginalText: Dispatch<SetStateAction<string>>
  setIsGenerating: Dispatch<SetStateAction<boolean>>
  setIsThinking: Dispatch<SetStateAction<boolean>>
}
