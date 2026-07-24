"use client"

import { IpWikiDialog } from "./ip-wiki-dialog"
import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { AimProjectTaskPanel } from "@/components/aim/aim-project-task-panel"
import { AimMessageStream } from "@/components/aim/aim-message-stream"
import { AimEvolutionSuggestions, AimLandingHero, AimProjectNotices, AimWorkbenchHeader } from "@/components/aim/aim-workbench-chrome"
import { WorkflowBriefDialog } from "@/components/aim/workflow-brief-dialog"
import { WorkflowRecordDialog } from "@/components/aim/workflow-record-dialog"
import { AimProjectAttachDialog } from "@/components/aim/aim-project-attach-dialog"
import { AimMethodologySelector, AimResearchHint } from "@/components/aim/aim-workbench-controls"
import { AimPlanQuestionCard } from "@/components/aim/aim-plan-question-card"
import { AimPlanStatusCard } from "@/components/aim/aim-plan-status-card"
import { AimPlanTaskSpecCard } from "@/components/aim/aim-plan-task-spec-card"
import { AimTurnIntentConfirmBar } from "@/components/aim/aim-turn-intent-confirm-bar"
import { useAimWorkbench } from "@/features/aim/hooks/use-aim-workbench"

export default function AimPage() {
  const w = useAimWorkbench()
  // 空状态（未选定 agent/阶段、无消息、无待处理意图）：正文用结果导向 Hero + composer 组成
  // 同一居中区域；顶部不展示完整四阶段步骤条，避免与正文快捷入口重复。
  const isLanding = w.showWorkflowLanding && !w.planSession.isPlanMode && !w.pendingTurnIntent

  const composer = (
    <>
      <AimResearchHint agentId={w.selectedAgentId} />
      <AimPromptComposer
        value={w.input}
        placeholder={w.composerMode === "plan" ? "用一句话描述你想做什么内容…" : w.agent.placeholder}
        busy={w.busy}
        isRecording={w.isRecording}
        isTranscribing={w.isTranscribing}
        isGenerating={w.isGenerating || w.isUploadingImage}
        canGenerate={
          (w.input.trim().length > 0 || w.imageAttachments.length > 0) &&
          (!w.projectEnabled || Boolean(w.selectedProjectId)) &&
          !w.isUploadingImage
        }
        primaryActionLabel={w.hasEditorSelection ? w.editorPanelLabels.selectActionLabel : w.agent.primaryActionLabel}
        onChange={w.setInput}
        onGenerate={w.handleGenerate}
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
      />
    </>
  )

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-3rem)] min-h-115 overflow-hidden md:-mx-6 md:-my-6">
      {/* 对话区（智能体列表与最近内容已移至全局侧边栏） */}
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background px-4 md:px-8">
        <AimWorkbenchHeader
          workflowStage={w.currentWorkflowStage}
          agentTitle={w.agent.title}
          AgentIcon={w.agent.icon}
          projectEnabled={w.projectEnabled}
          projects={w.projects}
          selectedProjectId={w.selectedProjectId}
          canEvolve={!w.isThinking && !w.isGenerating && !w.isEvolving && w.messages.length >= 2}
          isEvolving={w.isEvolving}
          showStageProgress={!isLanding}
          onStageChange={w.beginWorkflowStage}
          onProjectScopeChange={w.changeProjectScope}
          onEvolve={() => void w.handleEvolveConversation()}
          onReset={w.resetConversation}
        />

        <AimProjectNotices
          projectsCount={w.projects.length}
          selectedProjectId={w.selectedProjectId}
          projectEnabled={w.projectEnabled}
          projectAccessError={w.projectAccessError}
          personaProgress={w.personaProgress}
        />

        <AimMethodologySelector value={w.selectedMethodologyProfileIds} onChange={w.setSelectedMethodologyProfileIds} />

        {w.selectedProjectId && (
          <AimProjectTaskPanel
            records={w.projectWorkflowRecords}
            loading={w.isLoadingProjectWorkflow}
            onOpenTask={(id) => void w.openProjectWorkflowTask(id)}
            onStartStage={w.beginWorkflowStage}
          />
        )}

        <AimEvolutionSuggestions
          suggestions={w.evolutionSuggestions}
          onDismiss={w.dismissEvolutionSuggestion}
          onSave={(s) => void w.handleSaveEvolutionSuggestion(s)}
        />

        {/* 计划模式：问题卡片 / 任务单卡片（覆盖在对话区上方） */}
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

            {/* 输入区：悬浮卡片，对标 Claude composer */}
            {!w.planSession.isPlanMode && (
              <footer className="px-3 pb-2 pt-1 sm:px-5 sm:pb-3">{composer}</footer>
            )}
          </>
        )}
      </section>

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
