"use client"

import { forwardRef, useCallback, useState, type Ref } from "react"
import { ArrowRight } from "lucide-react"
import { AimDeliverableBubble } from "@/components/aim/aim-deliverable-bubble"
import { AimBatchDeliverableBubble } from "@/components/aim/aim-batch-deliverable-bubble"
import { AimMessageJumpRail } from "@/components/aim/aim-message-jump-rail"
import { AimQualityReport } from "@/components/aim/aim-quality-report"
import { ThinkingProcessPanel } from "@/components/aim/thinking-process-panel"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Button } from "@/components/ui/button"
import { getAimAgentGuide, type AimNextAction } from "@/lib/aim-agent-guides"
import { extractReplacementDraft } from "@/lib/aim-editor"
import { agentAllowsThinkingProcess } from "@/lib/aim/agent-capabilities"
import { isValidAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import type { AimWorkflowStage } from "@/lib/aim-workflow"
import { extractAimChoiceGroups, type AimChoiceGroup } from "@/lib/aim/choice-groups"
import { splitAimMethodNote } from "@/lib/aim/workbench-display"
import type { AimWorkbenchMessage, IpWikiDialogContext } from "@/lib/aim/workbench-types"
import type { ContentFormat } from "@/lib/api/client"
import type { WorkflowRecordMode } from "@/components/aim/workflow-record-dialog"
import type { FinalDisposition } from "@/lib/aim/run-outcome-telemetry"
import { AimRunOutcomeActions } from "@/components/aim/aim-run-outcome-select-items"

function ChoiceStepper({ groups, busy, onSubmit }: { groups: AimChoiceGroup[]; busy: boolean; onSubmit: (text: string) => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const group = groups[step]
  if (!group) return null
  const selected = answers[step]
  const next = () => {
    if (!selected) return
    if (step < groups.length - 1) return setStep((current) => current + 1)
    onSubmit(groups.map((item, index) => `${index + 1}. ${item.question}\n${answers[index]}`).join("\n\n"))
  }
  return <div className="mt-3 max-w-2xl rounded-xl border bg-muted/20 p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold text-muted-foreground">{step + 1}/{groups.length} · {group.question}</p><Button size="sm" variant="ghost" className="h-8 px-2.5" disabled={busy || !selected} onClick={next}><ArrowRight className="h-4 w-4" /></Button></div>
    <div className="grid gap-2">{group.options.map((option) => {
      const value = `${option.label}. ${option.text}`
      return <Button key={value} type="button" variant={selected === value ? "default" : "outline"} className="h-auto justify-start whitespace-normal px-3 py-2.5 text-left text-sm" disabled={busy} onClick={() => setAnswers((current) => ({ ...current, [step]: value }))}><span className="mr-1 font-semibold">{option.label}</span>{option.text}</Button>
    })}</div>
  </div>
}

function MessageContent({ message, showThinkingProcess }: {
  message: AimWorkbenchMessage
  showThinkingProcess: boolean
}) {
  if (message.role === "assistant") {
    const display = splitAimMethodNote(message.content)
    // 实时思考面板已展示、或本专家不展示思考时，不再重复「思考依据」
    const showMethodNote = Boolean(display.methodNote)
      && showThinkingProcess
      && !message.traceId
    return <>{showMethodNote ? <details className="mb-3 rounded-md border border-border bg-muted/25 px-3 py-2.5 text-sm text-muted-foreground"><summary className="cursor-pointer select-none font-medium text-foreground/80">思考依据</summary><div className="mt-2 border-t border-border/60 pt-2"><MarkdownRenderer content={display.methodNote} /></div></details> : null}<MarkdownRenderer content={display.result} /></>
  }
  return <>{message.images?.length ? <div className="mb-2 flex max-w-64 flex-wrap gap-2">{message.images.map((image) => <img key={image.id} src={image.previewUrl} alt={image.name} className="h-20 w-20 rounded-md border object-cover" />)}</div> : null}<p className="whitespace-pre-wrap break-words">{message.content}</p></>
}

function RunDiagnostics({ message }: { message: AimWorkbenchMessage }) {
  if (!message.deliverables || (!message.degraded && (!message.qualityStatus || message.qualityStatus === "pass")) || !message.runId) return null
  // 按状态分严重度：fail=红、warn/degraded=琥珀、skipped=中性灰。
  // 避免 fail 被灰底弱化、与 degraded 严重度倒挂；徽标文案直接点明状态，不再追加次级行。
  const tone = message.degraded || message.qualityStatus === "warn"
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    : message.qualityStatus === "fail"
      ? "bg-red-500/10 text-red-600 dark:text-red-400"
      : "bg-muted"
  const badge = message.degraded
    ? "已使用备用模型完成"
    : message.qualityStatus === "fail"
      ? "质检未通过"
      : message.qualityStatus === "warn"
        ? "待优化"
        : "免质检"
  return <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${tone}`}>{badge}</span>
    <span>执行编号 {message.runId}</span>
  </div>
}

interface MessageActions {
  onSubmitChoice: (text: string) => void
  onRetry: (message: AimWorkbenchMessage) => void
  onApplyReplacement: (message: AimWorkbenchMessage) => void
  onRepurpose: (messageId: string) => (formats: ContentFormat | ContentFormat[]) => void
  onQuality: (messageId: string) => () => void
  onMarkStatus: (messageId: string) => (status: string) => void
  onFinalDisposition: (messageId: string) => (disposition: FinalDisposition) => void
  onNextAction: (action: AimNextAction, content: string, generationId: string) => void
  onOpenRecord: (messageId: string, mode: WorkflowRecordMode) => void
  onCompileToWiki: (context: IpWikiDialogContext) => void
  onAttachProject?: (generationId: string) => void
  inlineEditKey?: string | null
  onInlineEditKeyChange?: (key: string | null) => void
  onInlineContentSaved: (messageId: string, format: ContentFormat, content: string) => void
  onInlineSelectionRewrite: (messageId: string, input: {
    format: ContentFormat
    prompt: string
    selectionText: string
    range: { start: number; end: number }
    draftContent: string
  }) => void
  referenceText?: string
  persona?: string
  topicTitle?: string
  projectId?: string
  onCanonicalUpdated?: (messageId: string, taskSpec: import("@/lib/task-spec").TaskSpec) => void
}

function MessageDeliverable({ message, selectedAgentId, selectedProjectId, latestDeliverableMessageId, busy, actions }: {
  message: AimWorkbenchMessage
  selectedAgentId: AimAgentId
  selectedProjectId: string
  latestDeliverableMessageId?: string
  busy: boolean
  actions: MessageActions
}) {
  const deliverables = message.deliverables
  if (!deliverables) return null
  const messageAgentId = isValidAimAgent(message.agentId) ? message.agentId : selectedAgentId
  const rawCopy = deliverables.results.find((result) => result.format === "raw_copy")?.content
  const wikiContext = message.agentId === "business_diagnosis" && selectedProjectId && rawCopy ? {
    projectId: selectedProjectId,
    sourceGenerationId: deliverables.id,
    positioningText: rawCopy,
  } : null
  return <div className="mt-2 w-full"><AimDeliverableBubble messageId={message.id} deliverables={deliverables} runId={message.runId} isCurrentVersion={message.id === latestDeliverableMessageId} agentId={messageAgentId} workflowStage={message.workflowStage} contentAction={message.contentAction} nextActions={getAimAgentGuide(messageAgentId).nextActions} onRepurpose={actions.onRepurpose(message.id)} onQuality={actions.onQuality(message.id)} onMarkStatus={actions.onMarkStatus(message.id)} onNextAction={actions.onNextAction} isBusy={busy} regenerating={Boolean(message.regenerating)} onInlineEditKeyChange={actions.onInlineEditKeyChange} inlineEditKey={actions.inlineEditKey} onInlineContentSaved={(format, content) => actions.onInlineContentSaved(message.id, format, content)} onInlineSelectionRewrite={(input) => actions.onInlineSelectionRewrite(message.id, input)} referenceText={actions.referenceText} persona={actions.persona} topicTitle={actions.topicTitle} projectId={actions.projectId} onOpenDecision={() => actions.onOpenRecord(message.id, "decision")} onOpenPublish={() => actions.onOpenRecord(message.id, "publish")} onOpenRetro={() => actions.onOpenRecord(message.id, "retro")} onAttachProject={actions.onAttachProject} onCompileToWiki={wikiContext ? () => actions.onCompileToWiki(wikiContext) : undefined} onCanonicalUpdated={({ taskSpec }) => actions.onCanonicalUpdated?.(message.id, taskSpec)} />{message.runId ? <AimRunOutcomeActions onSelect={actions.onFinalDisposition(message.id)} /> : null}</div>
}

function AimMessageCard({ message, busy, selectedAgentId, selectedProjectId, latestDeliverableMessageId, actions }: {
  message: AimWorkbenchMessage
  busy: boolean
  selectedAgentId: AimAgentId
  selectedProjectId: string
  latestDeliverableMessageId?: string
  actions: MessageActions
}) {
  const choices = message.role === "assistant" ? extractAimChoiceGroups(message.content) : []
  const messageAgentId = isValidAimAgent(message.agentId) ? message.agentId : selectedAgentId
  const showThinkingProcess = agentAllowsThinkingProcess(messageAgentId)
  const showLiveThinking = showThinkingProcess && Boolean(message.traceId)
  return <div data-message-id={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
    <div className={`${message.deliverables ? "w-full max-w-full" : "max-w-[96%]"} ${message.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
      <div className={`leading-8 ${message.role === "user" ? "rounded-2xl rounded-tr-sm bg-muted px-4 py-2.5 text-base text-foreground" : "bg-transparent p-0 text-base font-medium text-foreground/90"}`}>{message.role === "assistant" && showLiveThinking && message.traceId ? <div className="mb-3"><ThinkingProcessPanel traceId={message.traceId} type={message.traceType ?? "chat"} /></div> : null}<MessageContent message={message} showThinkingProcess={showThinkingProcess} /></div>
      {choices.length ? <ChoiceStepper groups={choices} busy={busy} onSubmit={actions.onSubmitChoice} /> : null}
      {message.role === "assistant" && message.failure ? <Button size="sm" variant="outline" className="mt-2 h-8 px-2.5 text-sm" onClick={() => actions.onRetry(message)} disabled={busy}><ArrowRight className="mr-1 h-3.5 w-3.5" />重试本次请求</Button> : null}
      {message.role === "assistant" && message.editorApply?.range && extractReplacementDraft(message.content) ? <Button size="sm" variant="outline" className="mt-2 h-8 px-2.5 text-sm" onClick={() => actions.onApplyReplacement(message)}>应用到文案选区</Button> : null}
      <MessageDeliverable message={message} selectedAgentId={selectedAgentId} selectedProjectId={selectedProjectId} latestDeliverableMessageId={latestDeliverableMessageId} busy={busy} actions={actions} />
      {message.role === "assistant" && message.batchDeliverables ? (
        <AimBatchDeliverableBubble deliverables={message.batchDeliverables} />
      ) : null}
      <RunDiagnostics message={message} />
      {message.qualityReport ? <AimQualityReport report={message.qualityReport} /> : null}
      {message.editorDiffSummary ? (
        <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">主编改动：</span>
          {message.editorDiffSummary}
        </div>
      ) : null}
    </div>
  </div>
}

function EmptyMessageState({ agentIntro }: {
  agentIntro: string
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col py-6">
      <div className="max-w-2xl text-left">
        <p className="line-clamp-3 text-base leading-7 text-muted-foreground">{agentIntro}</p>
      </div>
    </div>
  )
}

interface AimMessageStreamProps {
  messages: AimWorkbenchMessage[]
  busy: boolean
  agentIntro: string
  workflowStage: AimWorkflowStage
  selectedAgentId: AimAgentId
  selectedProjectId: string
  latestDeliverableMessageId?: string
  actions: MessageActions
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === "function") ref(value)
  else ref.current = value
}

export const AimMessageStream = forwardRef<HTMLDivElement, AimMessageStreamProps>(function AimMessageStream(props, ref) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollEl(node)
    assignRef(ref, node)
  }, [ref])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={setScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
        {props.messages.length === 0 ? (
          <EmptyMessageState agentIntro={props.agentIntro} />
        ) : (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 xl:max-w-7xl">
            {props.messages.map((message) => (
              <AimMessageCard
                key={message.id}
                message={message}
                busy={props.busy}
                selectedAgentId={props.selectedAgentId}
                selectedProjectId={props.selectedProjectId}
                latestDeliverableMessageId={props.latestDeliverableMessageId}
                actions={props.actions}
              />
            ))}
          </div>
        )}
      </div>
      <AimMessageJumpRail messages={props.messages} scrollEl={scrollEl} />
    </div>
  )
})
