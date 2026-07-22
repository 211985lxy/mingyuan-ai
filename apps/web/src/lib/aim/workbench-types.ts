import type { AimGenerateResponse, QualityCheckReport } from "@/lib/api/client"
import type { TextSelectionRange } from "@/lib/aim-editor"
import type { AimContentAction, AimWorkflowStage } from "@/lib/aim-workflow"

export interface AimImageAttachment {
  id: string
  name: string
  assetUrl: string
  readUrl: string
  previewUrl: string
}

export interface AimWorkbenchMessage {
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
  traceId?: string | null
  traceType?: "chat" | "generate" | null
}

export interface IpWikiDialogContext {
  projectId: string
  sourceGenerationId?: string
  positioningText?: string
}
