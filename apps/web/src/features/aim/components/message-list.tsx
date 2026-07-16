"use client"

import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import {
  AIM_CONTENT_ACTIONS,
  AIM_WORKFLOW_STAGES,
  type AimContentAction,
  type AimWorkflowStage,
} from "@/lib/aim-workflow"
import { getAimAgentGuide, type AimNextAction } from "@/lib/aim-agent-guides"
import { isValidAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import type { ContentFormat } from "@/lib/api/client"
import { extractReplacementDraft } from "@/lib/aim-editor"
import { extractChoiceGroups } from "@/features/aim/aim-choice-groups"
import { splitMethodNote } from "@/features/aim/aim-text-utils"
import type { ChatMessage, RecordDialogMode } from "@/features/aim/aim-workbench-types"
import { ChoiceStepper } from "@/features/aim/components/choice-stepper"
import { DeliverableBubble } from "@/features/aim/components/deliverable-bubble"
import { QualityReportCard } from "@/features/aim/components/quality-report-card"

interface AimMessageListProps {
  messages: ChatMessage[]
  showWorkflowLanding: boolean
  agentIntro: string
  currentWorkflowStage: AimWorkflowStage
  selectedAgentId: AimAgentId
  selectedProjectId: string
  busy: boolean
  latestDeliverableMessageId?: string
  onStartStage: (stage: AimWorkflowStage) => void
  onBeginContentAction: (action: AimContentAction) => void
  onSendText: (text: string) => void
  onRetryFailedMessage: (message: ChatMessage) => void
  onApplyEditorReplacement: (message: ChatMessage) => void
  onRepurpose: (messageId: string) => (format: ContentFormat) => void
  onQuality: (messageId: string) => () => void
  onMarkStatus: (messageId: string) => (status: string) => void
  onNextAction: (action: AimNextAction, content: string, generationId: string) => void
  onEditResult: (messageId: string, format: ContentFormat, content: string) => void
  onOpenRecordDialog: (messageId: string, mode: RecordDialogMode) => void
  onCompileToWiki: (sourceGenerationId: string, positioningText: string) => void
}

export function AimMessageList({
  messages,
  showWorkflowLanding,
  agentIntro,
  currentWorkflowStage,
  selectedAgentId,
  selectedProjectId,
  busy,
  latestDeliverableMessageId,
  onStartStage,
  onBeginContentAction,
  onSendText,
  onRetryFailedMessage,
  onApplyEditorReplacement,
  onRepurpose,
  onQuality,
  onMarkStatus,
  onNextAction,
  onEditResult,
  onOpenRecordDialog,
  onCompileToWiki,
}: AimMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col py-5">
        {showWorkflowLanding ? (
          <div>
            <p className="mb-3 text-sm font-semibold text-foreground">你今天要推进哪一步？</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AIM_WORKFLOW_STAGES.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  className="h-10 rounded-lg border bg-background px-3 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  onClick={() => onStartStage(stage.id)}
                >
                  {stage.id === "direction" ? "想清楚方向" : stage.id === "content" ? "开始做内容" : stage.id === "publish" ? "准备发布" : "复盘沉淀"}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl text-left">
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{agentIntro}</p>
            {currentWorkflowStage === "content" && selectedAgentId === "content_producer" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {AIM_CONTENT_ACTIONS.map((action) => (
                  <Button key={action.id} size="sm" variant="outline" className="h-8 rounded-md text-xs" onClick={() => onBeginContentAction(action.id)}>
                    {action.title}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-4">
      {messages.map((message) => (
        <MessageRow
          key={message.id}
          message={message}
          busy={busy}
          selectedAgentId={selectedAgentId}
          selectedProjectId={selectedProjectId}
          latestDeliverableMessageId={latestDeliverableMessageId}
          onSendText={onSendText}
          onRetryFailedMessage={onRetryFailedMessage}
          onApplyEditorReplacement={onApplyEditorReplacement}
          onRepurpose={onRepurpose}
          onQuality={onQuality}
          onMarkStatus={onMarkStatus}
          onNextAction={onNextAction}
          onEditResult={onEditResult}
          onOpenRecordDialog={onOpenRecordDialog}
          onCompileToWiki={onCompileToWiki}
        />
      ))}
    </div>
  )
}

function MessageRow({
  message,
  busy,
  selectedAgentId,
  selectedProjectId,
  latestDeliverableMessageId,
  onSendText,
  onRetryFailedMessage,
  onApplyEditorReplacement,
  onRepurpose,
  onQuality,
  onMarkStatus,
  onNextAction,
  onEditResult,
  onOpenRecordDialog,
  onCompileToWiki,
}: Omit<AimMessageListProps, "messages" | "showWorkflowLanding" | "agentIntro" | "currentWorkflowStage" | "onStartStage" | "onBeginContentAction"> & {
  message: ChatMessage
}) {
  const messageAgentId = isValidAimAgent(message.agentId) ? message.agentId : selectedAgentId
  const choiceGroups = message.role === "assistant" ? extractChoiceGroups(message.content) : []
  const display = message.role === "assistant" ? splitMethodNote(message.content) : null
  const canCompileToWiki =
    message.agentId === "business_diagnosis" &&
    !!selectedProjectId &&
    !!message.deliverables?.results.some((result) => result.format === "raw_copy")

  return (
    <div data-message-id={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`${message.deliverables ? "w-full max-w-full" : "max-w-[96%]"} ${message.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`leading-relaxed ${message.role === "user" ? "rounded-2xl rounded-tr-sm bg-muted px-4 py-2 text-sm text-foreground" : "bg-transparent p-0 text-sm sm:text-base text-foreground/90 font-medium"}`}>
          {message.role === "assistant" && display ? (
            <>
              {display.methodNote && (
                <details className="mb-3 rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none font-medium text-foreground/70">思考依据</summary>
                  <div className="mt-2 border-t border-border/60 pt-2">
                    <MarkdownRenderer content={display.methodNote} />
                  </div>
                </details>
              )}
              <MarkdownRenderer content={display.result} />
            </>
          ) : (
            <>
              {message.images?.length ? (
                <div className="mb-2 flex max-w-64 flex-wrap gap-2">
                  {message.images.map((image) => (
                    <img key={image.id} src={image.previewUrl} alt={image.name} className="h-20 w-20 rounded-md border object-cover" />
                  ))}
                </div>
              ) : null}
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </>
          )}
        </div>

        {choiceGroups.length > 0 && (
          <ChoiceStepper groups={choiceGroups} busy={busy} onSubmit={(text) => onSendText(text)} />
        )}

        {message.role === "assistant" && message.failure && (
          <Button size="sm" variant="outline" className="mt-2 h-7 px-2 text-xs" onClick={() => onRetryFailedMessage(message)} disabled={busy}>
            <ArrowRight className="mr-1 h-3.5 w-3.5" />
            重试本次请求
          </Button>
        )}

        {message.role === "assistant" && message.editorApply?.range && extractReplacementDraft(message.content) && (
          <Button size="sm" variant="outline" className="mt-2 h-7 px-2 text-xs" onClick={() => onApplyEditorReplacement(message)}>
            应用到右侧选区
          </Button>
        )}

        {message.deliverables && (
          <div className="w-full mt-2">
            <DeliverableBubble
              deliverables={message.deliverables}
              runId={message.runId}
              isCurrentVersion={message.id === latestDeliverableMessageId}
              agentId={messageAgentId}
              workflowStage={message.workflowStage}
              contentAction={message.contentAction}
              nextActions={getAimAgentGuide(messageAgentId).nextActions}
              onRepurpose={onRepurpose(message.id)}
              onQuality={onQuality(message.id)}
              onMarkStatus={onMarkStatus(message.id)}
              onNextAction={onNextAction}
              isBusy={busy}
              onEditResult={(format, content) => onEditResult(message.id, format, content)}
              onOpenDecision={() => onOpenRecordDialog(message.id, "decision")}
              onOpenPublish={() => onOpenRecordDialog(message.id, "publish")}
              onOpenRetro={() => onOpenRecordDialog(message.id, "retro")}
              onCompileToWiki={
                canCompileToWiki
                  ? () => {
                      const text = message.deliverables!.results.find((result) => result.format === "raw_copy")?.content ?? ""
                      onCompileToWiki(message.deliverables!.id, text)
                    }
                  : undefined
              }
            />
          </div>
        )}

        {message.deliverables && (message.degraded || (message.qualityStatus && message.qualityStatus !== "pass")) && message.runId && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${message.degraded ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted"}`}>
              {message.degraded ? "降级交付" : "质量提示"}
            </span>
            <span>执行编号 {message.runId}</span>
            {message.qualityStatus && message.qualityStatus !== "pass" && (
              <span>· 质量 {message.qualityStatus === "warn" ? "待优化" : message.qualityStatus === "fail" ? "未通过" : message.qualityStatus}</span>
            )}
          </div>
        )}

        {message.qualityReport && <QualityReportCard report={message.qualityReport} />}
      </div>
    </div>
  )
}
