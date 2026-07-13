"use client"

import type { Dispatch, SetStateAction } from "react"

import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { canStartAimGeneration } from "@/features/aim/aim-request-state"
import { IpWikiDialog, type IpWikiDialogContext } from "@/app/(dashboard)/aim/ip-wiki-dialog"
import { BenchmarkEditorPanel, type EditorSelection } from "@/features/aim/components/benchmark-editor-panel"
import { AimRecordDialog } from "@/features/aim/components/record-dialog"
import { WorkflowBriefDialog } from "@/features/aim/components/workflow-brief-dialog"
import { AimMessageList } from "@/features/aim/components/message-list"
import { AimWorkbenchChrome } from "@/features/aim/components/workbench-chrome"
import type { AimGeneration, ContentFormat } from "@/lib/api/client"
import type { AimContentAction, AimWorkflowStage, ConfirmedWorkflowBrief } from "@/lib/aim-workflow"
import type { AimAgentId, AimAgentMeta } from "@/lib/aim-ui-config"
import type { AimAgentGuide, AimNextAction, AimWorkbenchSkill } from "@/lib/aim-agent-guides"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"
import type { useAimRecordDialog } from "@/features/aim/hooks/use-aim-record-dialog"
import type { useAimProjectWorkflow } from "@/features/aim/hooks/use-aim-project-workflow"
import type { AimImageAttachment } from "@/features/aim/aim-workbench-types"
import type { AimEvolutionSuggestion } from "@/lib/aim-chat-evolution"

type ProjectWorkflowState = ReturnType<typeof useAimProjectWorkflow>
type RecordDialogState = ReturnType<typeof useAimRecordDialog>

interface WorkflowBriefState {
  sourceGenerationId?: string
  nextInput: string
  confirmed: ConfirmedWorkflowBrief
}

interface AimWorkbenchLayoutProps {
  agent: AimAgentMeta & AimAgentGuide
  currentWorkflowStage: AimWorkflowStage
  showWorkflowLanding: boolean
  selectedAgentId: AimAgentId
  selectedProjectId: string
  projectState: Pick<ProjectWorkflowState,
    | "projects"
    | "projectEnabled"
    | "projectWorkflowRecords"
    | "isLoadingProjectWorkflow"
    | "setProjectEnabled"
  >
  messages: ChatMessage[]
  busy: boolean
  isThinking: boolean
  isGenerating: boolean
  isEvolving: boolean
  isUploadingImage: boolean
  isRecording: boolean
  isTranscribing: boolean
  personaProgress: number | null
  evolutionSuggestions: AimEvolutionSuggestion[]
  input: string
  imageAttachments: AimImageAttachment[]
  latestDeliverableMessageId?: string
  hasEditorSelection: boolean
  hasEditor: boolean
  editorPanelLabels: EditorPanelLabels
  editorPanelOpen: boolean
  editorPanelWidth: number
  annotatedReferenceText: string
  editorText: string
  editorFormat?: ContentFormat
  isImitating: boolean
  imitateStyleId: string
  wikiDialog: { open: boolean; context: IpWikiDialogContext | null }
  workflowBrief: WorkflowBriefState | null
  workflowBriefForm: ConfirmedWorkflowBrief
  workflowBriefDialogOpen: boolean
  isBuildingWorkflowBrief: boolean
  recordState: RecordDialogState
  researchHintAgentIds: Set<AimAgentId>
  scrollRef: React.RefObject<HTMLDivElement | null>
  setInput: Dispatch<SetStateAction<string>>
  setImageAttachments: Dispatch<SetStateAction<AimImageAttachment[]>>
  setEditorPanelOpen: Dispatch<SetStateAction<boolean>>
  setEditorPanelWidth: Dispatch<SetStateAction<number>>
  setEditorText: Dispatch<SetStateAction<string>>
  setReferenceSelection: Dispatch<SetStateAction<EditorSelection>>
  setDraftSelection: Dispatch<SetStateAction<EditorSelection>>
  setImitateStyleId: Dispatch<SetStateAction<string>>
  setWikiDialog: Dispatch<SetStateAction<{ open: boolean; context: IpWikiDialogContext | null }>>
  setWorkflowBrief: Dispatch<SetStateAction<WorkflowBriefState | null>>
  setWorkflowBriefForm: Dispatch<SetStateAction<ConfirmedWorkflowBrief>>
  setWorkflowBriefDialogOpen: Dispatch<SetStateAction<boolean>>
  setEvolutionSuggestions: Dispatch<SetStateAction<AimEvolutionSuggestion[]>>
  onStartStage: (stage: AimWorkflowStage) => void
  onBeginContentAction: (action: AimContentAction) => void
  onEvolveConversation: () => void
  onResetConversation: () => void
  onOpenProjectTask: (id: string) => void
  onSaveEvolutionSuggestion: (suggestion: AimEvolutionSuggestion) => void
  onSendText: (text: string) => void
  onRetryFailedMessage: (message: ChatMessage) => void
  onApplyEditorReplacement: (message: ChatMessage) => void
  onRepurpose: (messageId: string) => (format: ContentFormat) => Promise<void>
  onQuality: (messageId: string) => () => Promise<void>
  onMarkStatus: (messageId: string) => (status: string) => Promise<void>
  onNextAction: (action: AimNextAction, content: string, generationId: string) => void
  onEditResult: (messageId: string, format: ContentFormat, content: string) => void
  onOpenRecordDialog: RecordDialogState["openRecordDialog"]
  onGenerate: () => void
  onStop: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onUseSkill: (skill: AimWorkbenchSkill) => void
  onAddImages: (files: FileList) => void
  onSaveEditor: () => boolean
  onImitate: () => void
  onConfirmWorkflowBrief: () => void
  onSubmitRecordDialog: () => void
}

export function AimWorkbenchLayout({
  agent,
  currentWorkflowStage,
  showWorkflowLanding,
  selectedAgentId,
  selectedProjectId,
  projectState,
  messages,
  busy,
  isThinking,
  isGenerating,
  isEvolving,
  isUploadingImage,
  isRecording,
  isTranscribing,
  personaProgress,
  evolutionSuggestions,
  input,
  imageAttachments,
  latestDeliverableMessageId,
  hasEditorSelection,
  hasEditor,
  editorPanelLabels,
  editorPanelOpen,
  editorPanelWidth,
  annotatedReferenceText,
  editorText,
  editorFormat,
  isImitating,
  imitateStyleId,
  wikiDialog,
  workflowBrief,
  workflowBriefForm,
  workflowBriefDialogOpen,
  isBuildingWorkflowBrief,
  recordState,
  researchHintAgentIds,
  scrollRef,
  setInput,
  setImageAttachments,
  setEditorPanelOpen,
  setEditorPanelWidth,
  setEditorText,
  setReferenceSelection,
  setDraftSelection,
  setImitateStyleId,
  setWikiDialog,
  setWorkflowBrief,
  setWorkflowBriefForm,
  setWorkflowBriefDialogOpen,
  setEvolutionSuggestions,
  onStartStage,
  onBeginContentAction,
  onEvolveConversation,
  onResetConversation,
  onOpenProjectTask,
  onSaveEvolutionSuggestion,
  onSendText,
  onRetryFailedMessage,
  onApplyEditorReplacement,
  onRepurpose,
  onQuality,
  onMarkStatus,
  onNextAction,
  onEditResult,
  onOpenRecordDialog,
  onGenerate,
  onStop,
  onStartRecording,
  onStopRecording,
  onUseSkill,
  onAddImages,
  onSaveEditor,
  onImitate,
  onConfirmWorkflowBrief,
  onSubmitRecordDialog,
}: AimWorkbenchLayoutProps) {
  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-3.5rem)] min-h-115 overflow-hidden md:-mx-6 md:-my-6">
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-card px-4 md:px-6">
        <AimWorkbenchChrome
          agentTitle={agent.title}
          agentIcon={agent.icon}
          currentWorkflowStage={currentWorkflowStage}
          projects={projectState.projects}
          projectEnabled={projectState.projectEnabled}
          selectedProjectId={selectedProjectId}
          projectWorkflowRecords={projectState.projectWorkflowRecords}
          isLoadingProjectWorkflow={projectState.isLoadingProjectWorkflow}
          personaProgress={personaProgress}
          evolutionSuggestions={evolutionSuggestions}
          isThinking={isThinking}
          isGenerating={isGenerating}
          isEvolving={isEvolving}
          messagesLength={messages.length}
          onStartStage={onStartStage}
          onToggleProjectEnabled={() => projectState.setProjectEnabled((value) => !value)}
          onEvolveConversation={onEvolveConversation}
          onResetConversation={onResetConversation}
          onOpenProjectTask={onOpenProjectTask}
          onDismissEvolutionSuggestion={(suggestion) => setEvolutionSuggestions((prev) => prev.filter((item) => item !== suggestion))}
          onSaveEvolutionSuggestion={onSaveEvolutionSuggestion}
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-4 sm:px-3">
          <AimMessageList
            messages={messages}
            showWorkflowLanding={showWorkflowLanding}
            agentIntro={agent.intro}
            currentWorkflowStage={currentWorkflowStage}
            selectedAgentId={selectedAgentId}
            selectedProjectId={selectedProjectId}
            busy={busy}
            latestDeliverableMessageId={latestDeliverableMessageId}
            onStartStage={onStartStage}
            onBeginContentAction={onBeginContentAction}
            onSendText={onSendText}
            onRetryFailedMessage={onRetryFailedMessage}
            onApplyEditorReplacement={onApplyEditorReplacement}
            onRepurpose={onRepurpose}
            onQuality={onQuality}
            onMarkStatus={onMarkStatus}
            onNextAction={onNextAction}
            onEditResult={onEditResult}
            onOpenRecordDialog={onOpenRecordDialog}
            onCompileToWiki={(sourceGenerationId, positioningText) => {
              setWikiDialog({
                open: true,
                context: { projectId: selectedProjectId, sourceGenerationId, positioningText },
              })
            }}
          />
        </div>

        <footer className="border-t px-3 py-2 sm:px-5">
          {researchHintAgentIds.has(selectedAgentId) && (
            <p className="mx-auto mb-2 hidden max-w-2xl text-xs text-muted-foreground lg:block">
              可以直接把官网链接、竞品资料、客户资料或 Research Agent 资料包粘贴到聊天框里，系统会作为诊断上下文使用。
            </p>
          )}
          <AimPromptComposer
            value={input}
            placeholder={agent.placeholder}
            busy={busy}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            isGenerating={isGenerating || isUploadingImage}
            canGenerate={canStartAimGeneration({
              text: input,
              imageCount: imageAttachments.length,
              projectEnabled: projectState.projectEnabled,
              projectId: selectedProjectId,
              uploadingImage: isUploadingImage,
            })}
            primaryActionLabel={hasEditorSelection ? editorPanelLabels.selectActionLabel : agent.primaryActionLabel}
            onChange={setInput}
            onGenerate={onGenerate}
            onStop={onStop}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
            skills={agent.skills}
            onUseSkill={onUseSkill}
            imageAttachments={imageAttachments}
            onAddImages={onAddImages}
            onRemoveImage={(id) => setImageAttachments((current) => current.filter((image) => image.id !== id))}
          />
        </footer>
      </section>

      {hasEditor && (
        <BenchmarkEditorPanel
          open={editorPanelOpen}
          width={editorPanelWidth}
          labels={editorPanelLabels}
          referenceText={annotatedReferenceText}
          editorText={editorText}
          editorFormat={editorFormat}
          onOpen={() => setEditorPanelOpen(true)}
          onClose={() => setEditorPanelOpen(false)}
          onWidthChange={setEditorPanelWidth}
          onEditorTextChange={setEditorText}
          onReferenceSelection={setReferenceSelection}
          onDraftSelection={setDraftSelection}
          onSave={onSaveEditor}
          onImitate={onImitate}
          imitating={isImitating}
          imitateStyleId={imitateStyleId}
          onImitateStyleChange={setImitateStyleId}
        />
      )}

      {wikiDialog.open && wikiDialog.context && (
        <IpWikiDialog
          key={wikiDialog.context.sourceGenerationId ?? "ip-wiki"}
          context={wikiDialog.context}
          onClose={() => setWikiDialog((prev) => ({ ...prev, open: false }))}
        />
      )}

      <WorkflowBriefDialog
        open={workflowBriefDialogOpen && !!workflowBrief}
        busy={isBuildingWorkflowBrief}
        form={workflowBriefForm}
        setForm={setWorkflowBriefForm}
        onOpenChange={(open) => {
          setWorkflowBriefDialogOpen(open)
          if (!open) setWorkflowBrief(null)
        }}
        onCancel={() => { setWorkflowBriefDialogOpen(false); setWorkflowBrief(null) }}
        onConfirm={onConfirmWorkflowBrief}
      />

      <AimRecordDialog
        recordDialog={recordState.recordDialog}
        decisionForm={recordState.decisionForm}
        publishForm={recordState.publishForm}
        retroForm={recordState.retroForm}
        retroRuleForm={recordState.retroRuleForm}
        outcomeForm={recordState.outcomeForm}
        outcomeWindow={recordState.outcomeWindow}
        busy={busy}
        setRecordDialog={recordState.setRecordDialog}
        setDecisionForm={recordState.setDecisionForm}
        setPublishForm={recordState.setPublishForm}
        setRetroForm={recordState.setRetroForm}
        setRetroRuleForm={recordState.setRetroRuleForm}
        setOutcomeForm={recordState.setOutcomeForm}
        setOutcomeWindow={recordState.setOutcomeWindow}
        onSubmit={onSubmitRecordDialog}
      />
    </div>
  )
}
