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
  /** 主编改稿摘要（editor_revise） */
  editorDiffSummary?: string | null
  editorApply?: { range: TextSelectionRange } | null
  runId?: string | null
  degraded?: boolean | null
  qualityStatus?: "pass" | "warn" | "fail" | "skipped" | null
  workflowStage?: AimWorkflowStage
  contentAction?: AimContentAction | null
  failure?: { kind: "chat" | "generate"; retryText: string } | null
  traceId?: string | null
  traceType?: "chat" | "generate" | null
  /** 同线程重新生成中：保留旧交付物可见，避免闪断 */
  regenerating?: boolean
  /** 批量复刻交付物：由 runBatchReplicateSend 产出，不走标准生成链路。
   *  在聊天流内以批量卡片形式展示 N 条生成的文案。 */
  batchDeliverables?: BatchDeliverableResult | null
}

/** 批量复刻交付物：提取的结构 + 生成的 N 条文案。 */
export interface BatchDeliverableResult {
  /** 提取出的结构模板摘要 */
  structure: {
    id: string
    displayName: string
    description: string | null
  }
  /** 生成的文案列表 */
  scripts: Array<{
    id: string
    title: string
    content: string
  }>
}

export interface IpWikiDialogContext {
  projectId: string
  sourceGenerationId?: string
  positioningText?: string
}
