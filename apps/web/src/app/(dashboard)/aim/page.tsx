"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { IpWikiDialog } from "./ip-wiki-dialog"
import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { AimContextUsage } from "@/components/aim/aim-context-usage"
import { AimMessageStream } from "@/components/aim/aim-message-stream"
import { AimEvolutionSuggestions, AimLandingHero, AimProjectNotices, AimWorkbenchHeader } from "@/components/aim/aim-workbench-chrome"
import { AimStylePreviewDialog } from "@/components/aim/aim-style-preview-dialog"
import { WorkflowBriefDialog } from "@/components/aim/workflow-brief-dialog"
import { WorkflowRecordDialog } from "@/components/aim/workflow-record-dialog"
import { AimProjectAttachDialog } from "@/components/aim/aim-project-attach-dialog"
import { AimMethodologySelector, AimResearchHint } from "@/components/aim/aim-workbench-controls"
import { AimPlanQuestionCard } from "@/components/aim/aim-plan-question-card"
import { AimPlanStatusCard } from "@/components/aim/aim-plan-status-card"
import { AimPlanTaskSpecCard } from "@/components/aim/aim-plan-task-spec-card"
import { AimTurnIntentConfirmBar } from "@/components/aim/aim-turn-intent-confirm-bar"
import { useAimWorkbench } from "@/features/aim/hooks/use-aim-workbench"
import { buildAimChatMessages } from "@/lib/aim/chat-request"
import { AIM_CONTEXT_CAPACITY_TOKENS, estimateContextTokens } from "@/lib/aim-context-usage"
import { formatAimMessageContentForModel } from "@/lib/aim/workbench-helpers"
import {
  assemblePasteUsageInput,
  PASTE_COMPOSER_PLACEHOLDER,
  type PastedCopyAttachment,
} from "@/lib/aim/paste-copy-attachment"
import { fetchStyleStatus } from "@/lib/api/aim"

export default function AimPage() {
  const w = useAimWorkbench()
  const router = useRouter()
  const [pastedCopy, setPastedCopy] = useState<PastedCopyAttachment | null>(null)
  const [stylePreviewOpen, setStylePreviewOpen] = useState(false)
  const [styleSamples, setStyleSamples] = useState<Array<{ content: string; label?: "core" | "normal" }>>([])
  const [styleEnabled, setStyleEnabled] = useState(false)

  const isLanding = w.showWorkflowLanding && !w.planSession.isPlanMode && !w.pendingTurnIntent
  const contextUsage = useMemo(() => {
    const thread = w.messages.map((message) => ({
      role: message.role,
      content: formatAimMessageContentForModel(message),
      images: message.images,
    }))
    if (w.input.trim()) {
      thread.push({ role: "user", content: w.input, images: undefined })
    }
    if (pastedCopy?.content) {
      thread.push({ role: "user", content: pastedCopy.content, images: undefined })
    }
    const messages = buildAimChatMessages(thread)
    return {
      usedTokens: estimateContextTokens({ messages }),
      maxTokens: AIM_CONTEXT_CAPACITY_TOKENS,
    }
  }, [w.input, w.messages, pastedCopy])

  const refreshStyleStatus = useCallback(async () => {
    try {
      const status = await fetchStyleStatus({
        projectId: w.projectEnabled ? w.selectedProjectId || undefined : undefined,
      })
      setStyleEnabled(status.enabled)
    } catch {
      setStyleEnabled(false)
    }
  }, [w.projectEnabled, w.selectedProjectId])

  useEffect(() => {
    void refreshStyleStatus()
  }, [refreshStyleStatus])

  const openStylePreview = useCallback((attachment: PastedCopyAttachment) => {
    setStyleSamples([{ content: attachment.content, label: "core" }])
    setStylePreviewOpen(true)
  }, [])

  const handleComposerGenerate = useCallback(() => {
    if (pastedCopy?.usage === "style_sample") {
      openStylePreview(pastedCopy)
      return
    }
    if (pastedCopy && !pastedCopy.usage) {
      toast.message("请先选择这篇文案的用途")
      return
    }
    if (pastedCopy?.usage) {
      const assembled = assemblePasteUsageInput({
        instruction: w.input,
        attachment: pastedCopy,
      })
      if (assembled) {
        setPastedCopy(null)
        w.setInput("")
        void w.generateWithInput(assembled)
        return
      }
    }
    w.handleGenerate()
  }, [openStylePreview, pastedCopy, w])

  const composerPlaceholder =
    w.composerMode === "plan"
      ? "用一句话描述你想做什么内容…"
      : PASTE_COMPOSER_PLACEHOLDER

  const canGenerateBase =
    (w.input.trim().length > 0 || w.imageAttachments.length > 0 || Boolean(pastedCopy)) &&
    (!w.projectEnabled || Boolean(w.selectedProjectId)) &&
    !w.isUploadingImage

  const composer = (
    <>
      <AimResearchHint agentId={w.selectedAgentId} />
      <AimPromptComposer
        value={w.input}
        placeholder={composerPlaceholder}
        busy={w.busy}
        isRecording={w.isRecording}
        isTranscribing={w.isTranscribing}
        isGenerating={w.isGenerating || w.isUploadingImage}
        canGenerate={canGenerateBase}
        primaryActionLabel={w.hasEditorSelection ? w.editorPanelLabels.selectActionLabel : w.agent.primaryActionLabel}
        onChange={w.setInput}
        onGenerate={handleComposerGenerate}
        onStop={w.handleStop}
        onStartRecording={w.startRecording}
        onStopRecording={w.stopRecording}
        showSkills={Boolean(w.params.agentParam)}
        skills={w.agent.skills}
        onUseSkill={w.handleUseSkill}
        imageAttachments={w.imageAttachments}
        onAddImages={(files) => void w.addImages(files)}
        onRemoveImage={w.removeImage}
        composerMode={w.composerMode}
        onComposerModeChange={w.setComposerMode}
        canUsePlanMode={w.canUsePlanMode}
        isPlanSessionActive={w.planSession.isPlanMode}
        showContentMode={w.selectedAgentId === "content_producer"}
        contentMode={w.agentModule}
        onContentModeChange={w.setAgentModule}
        pastedCopy={pastedCopy}
        onPastedCopyChange={setPastedCopy}
        onStyleSampleRequest={openStylePreview}
        styleEnabled={styleEnabled}
        onOpenStyleAssets={() => {
          if (w.projectEnabled && w.selectedProjectId) {
            router.push(`/projects?focus=style&projectId=${encodeURIComponent(w.selectedProjectId)}`)
          } else {
            router.push("/projects?focus=style")
          }
        }}
      />
      <AimContextUsage
        usedTokens={contextUsage.usedTokens}
        maxTokens={contextUsage.maxTokens}
      />
    </>
  )

  return (
    <div className="-mx-3 -my-3 flex h-[calc(100dvh-2.25rem)] min-h-115 overflow-hidden md:-mx-4 md:-my-4">
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background px-2 md:px-4">
        <AimWorkbenchHeader
          workflowStage={w.currentWorkflowStage}
          agentTitle={w.agent.title}
          AgentIcon={w.agent.icon}
          projectEnabled={w.projectEnabled}
          projects={w.projects}
          selectedProjectId={w.selectedProjectId}
          showStageProgress={!isLanding}
          onStageChange={w.beginWorkflowStage}
          onProjectScopeChange={w.changeProjectScope}
          onReset={w.resetConversation}
          projectTasks={
            w.selectedProjectId
              ? {
                  records: w.projectWorkflowRecords,
                  loading: w.isLoadingProjectWorkflow,
                  onOpenTask: (id) => void w.openProjectWorkflowTask(id),
                }
              : undefined
          }
        />

        <AimProjectNotices
          projectsCount={w.projects.length}
          selectedProjectId={w.selectedProjectId}
          projectEnabled={w.projectEnabled}
          projectAccessError={w.projectAccessError}
          personaProgress={w.personaProgress}
        />

        <AimMethodologySelector value={w.selectedMethodologyProfileIds} onChange={w.setSelectedMethodologyProfileIds} />

        <AimEvolutionSuggestions
          suggestions={w.evolutionSuggestions}
          onDismiss={w.dismissEvolutionSuggestion}
          onSave={(s) => void w.handleSaveEvolutionSuggestion(s)}
        />

        {w.planSession.session?.status === "asking" && !w.planSession.currentQuestion && (
          <div className="px-3 py-2 sm:px-5">
            <AimPlanStatusCard
              loading={w.planSession.session.loading}
              error={w.planSession.session.error}
              onRetry={() => void w.planSession.retryPlan()}
              onAbandon={w.handlePlanAbandon}
            />
          </div>
        )}
        {w.planSession.session?.status === "asking" && w.planSession.currentQuestion && (
          <div className="px-3 py-2 sm:px-5">
            <AimPlanQuestionCard
              question={w.planSession.currentQuestion}
              questionNumber={w.planSession.questionNumber}
              totalQuestions={w.planSession.totalQuestions}
              loading={w.planSession.session.loading}
              canGoBack={w.planSession.session.currentIndex > 0}
              onSelectOption={w.planSession.answerOption}
              onSelectCustom={w.planSession.answerCustom}
              onGoBack={w.planSession.goBack}
            />
          </div>
        )}
        {w.planSession.session?.status === "reviewing" && (
          <div className="px-3 py-2 sm:px-5">
            <AimPlanTaskSpecCard
              taskSpec={w.planSession.session.taskSpec}
              assumptions={w.planSession.session.assumptions}
              requirement={w.planSession.session.requirement}
              busy={w.busy}
              onConfirm={w.handlePlanConfirm}
              onAbandon={w.handlePlanAbandon}
              onReSelect={(field) => w.planSession.reselectField(field)}
            />
          </div>
        )}

        {w.intentResolving && !w.planSession.isPlanMode && (
          <div className="px-3 py-2 sm:px-5">
            <p className="mx-auto max-w-lg text-center text-sm text-muted-foreground">
              正在辨认本轮意图…
            </p>
          </div>
        )}

        {w.pendingTurnIntent && !w.planSession.isPlanMode && (
          <div className="px-3 py-2 sm:px-5">
            <AimTurnIntentConfirmBar
              key={`${w.pendingTurnIntent.text}:${w.pendingTurnIntent.intent.summary}`}
              intent={w.pendingTurnIntent.intent}
              busy={w.busy}
              source={w.pendingTurnIntent.source}
              onConfirm={w.handleConfirmTurnIntent}
              onCancel={w.handleCancelTurnIntent}
            />
          </div>
        )}

        {isLanding ? (
          <AimLandingHero onBeginContentAction={w.beginContentAction}>{composer}</AimLandingHero>
        ) : (
          <>
            <AimMessageStream
              ref={w.scrollRef}
              messages={w.messages}
              busy={w.busy}
              agentIntro={w.agent.intro}
              workflowStage={w.currentWorkflowStage}
              selectedAgentId={w.selectedAgentId}
              selectedProjectId={w.selectedProjectId}
              latestDeliverableMessageId={w.latestDeliverableMessageId}
              onBeginContentAction={w.beginContentAction}
              actions={{
                onSubmitChoice: (text) => void w.sendText(text),
                onRetry: w.retryFailed,
                onApplyReplacement: w.applyEditorReplacement,
                onRepurpose: w.handleRepurpose,
                onQuality: w.handleQuality,
                onMarkStatus: w.handleMarkStatus,
                onNextAction: w.handleAimNextAction,
                onOpenRecord: w.openRecordDialog,
                onCompileToWiki: (ctx) => w.setWikiDialog({ open: true, context: ctx }),
                onAttachProject: w.projectEnabled ? undefined : w.projectAttach.openDialog,
                inlineEditKey: w.inlineEditKey,
                onInlineEditKeyChange: w.setInlineEditKey,
                onInlineContentSaved: w.handleInlineContentSaved,
                onInlineSelectionRewrite: w.handleInlineSelectionRewrite,
                referenceText: w.sourceOriginalText,
                persona: w.agent.defaultInstruction,
                topicTitle: w.sourceTopicTitle,
                projectId: w.selectedProjectId || undefined,
                onCanonicalUpdated: (messageId, taskSpec) => {
                  w.setMessages((messages) =>
                    messages.map((message) =>
                      message.id === messageId && message.deliverables
                        ? { ...message, deliverables: { ...message.deliverables, taskSpec } }
                        : message,
                    ),
                  )
                },
              }}
            />

            {!w.planSession.isPlanMode && (
              <footer className="px-3 pb-2 pt-1 sm:px-5 sm:pb-3">{composer}</footer>
            )}
          </>
        )}
      </section>

      <AimStylePreviewDialog
        open={stylePreviewOpen}
        samples={styleSamples}
        projectId={w.projectEnabled ? w.selectedProjectId || null : null}
        onOpenChange={setStylePreviewOpen}
        onCommitted={() => {
          setPastedCopy(null)
          void refreshStyleStatus()
        }}
      />

      {w.wikiDialog.open && w.wikiDialog.context && (
        <IpWikiDialog
          key={w.wikiDialog.context.sourceGenerationId ?? "ip-wiki"}
          context={w.wikiDialog.context}
          onClose={() => w.setWikiDialog((prev) => ({ ...prev, open: false }))}
        />
      )}

      <WorkflowBriefDialog
        open={w.workflowBriefDialogOpen && !!w.workflowBrief}
        form={w.workflowBriefForm}
        busy={w.isBuildingWorkflowBrief}
        onChange={w.setWorkflowBriefForm}
        onCancel={w.closeWorkflowBriefDialog}
        onConfirm={w.confirmWorkflowBrief}
      />

      <WorkflowRecordDialog
        dialog={w.recordDialog}
        busy={w.busy}
        decisionForm={w.decisionForm}
        publishForm={w.publishForm}
        retroForm={w.retroForm}
        ruleForm={w.retroRuleForm}
        outcomeForm={w.outcomeForm}
        outcomeWindow={w.outcomeWindow}
        onDecisionChange={w.setDecisionForm}
        onPublishChange={w.setPublishForm}
        onRetroChange={w.setRetroForm}
        onRuleChange={w.setRetroRuleForm}
        onOutcomeChange={w.setOutcomeForm}
        onOutcomeWindowChange={w.setOutcomeWindow}
        onClose={w.closeRecordDialog}
        onSubmit={() => void w.submitRecordDialog()}
      />

      <AimProjectAttachDialog
        open={w.projectAttach.open}
        projects={w.projects}
        mode={w.projectAttach.mode}
        projectId={w.projectAttach.projectId}
        projectName={w.projectAttach.projectName}
        busy={w.projectAttach.busy}
        onModeChange={w.projectAttach.setMode}
        onProjectIdChange={w.projectAttach.setProjectId}
        onProjectNameChange={w.projectAttach.setProjectName}
        onClose={w.projectAttach.closeDialog}
        onSubmit={() => void w.projectAttach.submit()}
      />
    </div>
  )
}
