import type {
  AimChatToolAction,
  AimGenerateResponse,
  AimRetroSnapshot,
  ContentFormat,
  QualityCheckReport,
} from "@/lib/api/client"
import type { AimContentAction, AimWorkflowStage } from "@/lib/aim-workflow"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { TextSelectionRange } from "@/lib/aim-editor"

export interface AimImageAttachment {
  id: string
  name: string
  assetUrl: string
  readUrl: string
  previewUrl: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  images?: AimImageAttachment[]
  agentId?: string | null
  deliverables?: AimGenerateResponse | null
  qualityReport?: QualityCheckReport | null
  editorApply?: { range: TextSelectionRange } | null
  runId?: string | null
  degraded?: boolean | null
  qualityStatus?: "pass" | "warn" | "fail" | "skipped" | null
  workflowStage?: AimWorkflowStage
  contentAction?: AimContentAction | null
  failure?: { kind: "chat" | "generate"; retryText: string } | null
}

export type RecordDialogMode = "decision" | "publish" | "retro"

export interface RecordDialogState {
  mode: RecordDialogMode
  generationId: string
}

export interface AimDraft {
  selectedAgentId: AimAgentId
  selectedProjectId: string
  input: string
  messages: ChatMessage[]
  videoCopyExtractionId?: string
  sourceOriginalText?: string
  sourceAnalysisText?: string
  sourceTopicTitle?: string
  sourceTopicRationale?: string
  editorText?: string
  editorFormat?: ContentFormat
  editorSourceMessageId?: string
  editorPanelWidth?: number
  editorPanelOpen?: boolean
}

export type { AimChatToolAction, AimRetroSnapshot }
