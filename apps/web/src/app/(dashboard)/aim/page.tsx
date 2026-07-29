"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { useAimVideoCopyInput } from "@/features/aim/hooks/use-aim-video-copy-input"
import { useAimWorkbench } from "@/features/aim/hooks/use-aim-workbench"
import { buildAimChatMessages } from "@/lib/aim/chat-request"
import { getAimAgentCapabilities } from "@/lib/aim/agent-capabilities"
import { AIM_CONTEXT_CAPACITY_TOKENS, estimateContextTokens } from "@/lib/aim-context-usage"
import {
  buildContentProducerVideoCopyHref,
  resolveContentProducerVideoUrl,
} from "@/lib/aim/video-copy-input"
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
  const capabilities = useMemo(
    () => getAimAgentCapabilities(w.selectedAgentId),
    [w.selectedAgentId],
  )
  const [pastedCopy, setPastedCopy] = useState<PastedCopyAttachment | null>(null)
  const [stylePreviewOpen, setStylePreviewOpen] = useState(false)
  const [styleSamples, setStyleSamples] = useState<Array<{ content: string; label?: "core" | "normal" }>>([])
  const [styleEnabled, setStyleEnabled] = useState(false)
  const openCompletedVideoCopy = useCallback((record: { id: string }) => {
    router.replace(buildContentProducerVideoCopyHref({
      recordId: record.id,
      projectId: w.projectEnabled ? w.selectedProjectId || undefined : undefined,
    }))
  }, [router, w.projectEnabled, w.selectedProjectId])
  const {
    isProcessingVideo,
    processVideoUrl,
    cancelVideoProcessing,
  } = useAimVideoCopyInput({
    enabled: capabilities.videoCopyExtraction,
    onCompleted: openCompletedVideoCopy,
  })

  // 切专家 / 切项目：清理任务级临时态。首屏与「空项目→补齐项目」不算切换，避免刚粘贴的质检附件被冲掉。
  const scopeRef = useRef({ agentId: w.selectedAgentId, projectId: w.selectedProjectId })
  useEffect(() => {
    const prev = scopeRef.current
    const agentChanged = prev.agentId !== w.selectedAgentId
    const projectChanged = prev.projectId !== w.selectedProjectId
    scopeRef.current = { agentId: w.selectedAgentId, projectId: w.selectedProjectId }
    if (!agentChanged && !projectChanged) return
    if (!agentChanged && !prev.projectId && w.selectedProjectId) return
    setPastedCopy(null)
    setStylePreviewOpen(false)
    setStyleSamples([])
  }, [w.selectedAgentId, w.selectedProjectId])

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
    if (capabilities.videoCopyExtraction) {
      const videoUrl = resolveContentProducerVideoUrl(w.selectedAgentId, w.input)
      if (videoUrl) {
        void processVideoUrl(videoUrl)
        return
      }
    }
    // 质检/编辑只有一种用途时，允许未点选也能直接发，避免发送键假死
    const effectiveUsage = pastedCopy?.usage
      ?? (capabilities.pasteMode === "review"
        ? "review" as const
        : capabilities.pasteMode === "edit"
          ? "edit" as const
          : undefined)
    const activePaste = pastedCopy && effectiveUsage
      ? { ...pastedCopy, usage: effectiveUsage }
      : pastedCopy
    if (activePaste?.usage === "style_sample") {
      if (!capabilities.styleSample) {
        toast.message("当前专家不支持风格沉淀")
        return
      }
      openStylePreview(activePaste)
      return
    }
    if (activePaste?.usage === "benchmark" && !capabilities.benchmarkReference) {
      toast.message("当前专家不支持对标参考")
      return
    }
    if (pastedCopy && !effectiveUsage) {
      toast.message("请先选择这篇文案的用途")
      return
    }
    if (activePaste?.usage) {
      const assembled = assemblePasteUsageInput({
        instruction: w.input,
        attachment: activePaste,
      })
      if (assembled) {
        setPastedCopy(null)
        w.setInput("")
        void w.generateWithInput(assembled)
        return
      }
    }
    w.handleGenerate()
  }, [capabilities, openStylePreview, pastedCopy, processVideoUrl, w])

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
        busy={w.busy || isProcessingVideo}
        isRecording={w.isRecording}
        isTranscribing={w.isTranscribing}
        isGenerating={w.isGenerating || w.isUploadingImage || isProcessingVideo}
        canGenerate={canGenerateBase}
        primaryActionLabel={w.hasEditorSelection ? w.editorPanelLabels.selectActionLabel : w.agent.primaryActionLabel}
        onChange={w.setInput}
        onGenerate={handleComposerGenerate}
        onStop={isProcessingVideo ? cancelVideoProcessing : w.handleStop}
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
        showContentMode={capabilities.contentModeSelector}
        contentMode={w.agentModule}
        onContentModeChange={w.setAgentModule}
        pastedCopy={pastedCopy}
        onPastedCopyChange={capabilities.pasteMode === "plain" ? undefined : setPastedCopy}
        onStyleSampleRequest={capabilities.styleSample ? openStylePreview : undefined}
        styleEnabled={styleEnabled && capabilities.styleSample}
        capabilities={capabilities}
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
