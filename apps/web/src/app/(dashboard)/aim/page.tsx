"use client"

import { IpWikiDialog } from "./ip-wiki-dialog"
import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { AimProjectTaskPanel } from "@/components/aim/aim-project-task-panel"
import { BenchmarkEditorPanel } from "@/components/aim/benchmark-editor-panel"
import { AimMessageStream } from "@/components/aim/aim-message-stream"
import { AimEvolutionSuggestions, AimProjectNotices, AimWorkbenchHeader } from "@/components/aim/aim-workbench-chrome"
import { WorkflowBriefDialog } from "@/components/aim/workflow-brief-dialog"
import { WorkflowRecordDialog } from "@/components/aim/workflow-record-dialog"
import { AimProjectAttachDialog } from "@/components/aim/aim-project-attach-dialog"
import { AimContentModeSelector, AimMethodologySelector, AimResearchHint } from "@/components/aim/aim-workbench-controls"
import { AimPlanQuestionCard } from "@/components/aim/aim-plan-question-card"
import { AimPlanStatusCard } from "@/components/aim/aim-plan-status-card"
import { AimPlanTaskSpecCard } from "@/components/aim/aim-plan-task-spec-card"
import { useAimWorkbench } from "@/features/aim/hooks/use-aim-workbench"

export default function AimPage() {
  const w = useAimWorkbench()

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-3.5rem)] min-h-115 overflow-hidden md:-mx-6 md:-my-6">
      {/* 对话区（智能体列表与最近内容已移至全局侧边栏） */}
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-card px-4 md:px-6">
        <AimWorkbenchHeader
          workflowStage={w.currentWorkflowStage}
          agentTitle={w.agent.title}
          AgentIcon={w.agent.icon}
          projectEnabled={w.projectEnabled}
          projects={w.projects}
          selectedProjectId={w.selectedProjectId}
          canEvolve={!w.isThinking && !w.isGenerating && !w.isEvolving && w.messages.length >= 2}
          isEvolving={w.isEvolving}
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

        <AimMessageStream
          ref={w.scrollRef}
          messages={w.messages}
          busy={w.busy}
          workflowLanding={w.showWorkflowLanding && !w.planSession.isPlanMode}
          agentIntro={w.agent.intro}
          workflowStage={w.currentWorkflowStage}
          selectedAgentId={w.selectedAgentId}
          selectedProjectId={w.selectedProjectId}
          latestDeliverableMessageId={w.latestDeliverableMessageId}
          onBeginStage={w.beginWorkflowStage}
          onBeginContentAction={w.beginContentAction}
          actions={{
            onSubmitChoice: (text) => void w.sendText(text),
            onRetry: w.retryFailed,
            onApplyReplacement: w.applyEditorReplacement,
            onRepurpose: w.handleRepurpose,
            onQuality: w.handleQuality,
            onMarkStatus: w.handleMarkStatus,
            onNextAction: w.handleAimNextAction,
            onEditResult: w.openEditorFromResult,
            onOpenRecord: w.openRecordDialog,
            onCompileToWiki: (ctx) => w.setWikiDialog({ open: true, context: ctx }),
            onAttachProject: w.projectEnabled ? undefined : w.projectAttach.openDialog,
          }}
        />

        {/* 输入区：计划会话启动后由问题卡片接管，避免重复提交另一份计划。 */}
        {!w.planSession.isPlanMode && (
          <footer className="border-t px-3 py-2 sm:px-5">
            {w.selectedAgentId === "content_producer" && <AimContentModeSelector value={w.agentModule} onChange={w.setAgentModule} />}
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
            />
          </footer>
        )}
      </section>

      {w.hasEditor && (
        <BenchmarkEditorPanel
          open={w.editorPanelOpen}
          width={w.editorPanelWidth}
          labels={w.editorPanelLabels}
          referenceText={w.annotatedReferenceText}
          editorText={w.editorText}
          editorFormat={w.editorFormat}
          onOpen={() => w.setEditorPanelOpen(true)}
          onClose={() => w.setEditorPanelOpen(false)}
          onWidthChange={w.setEditorPanelWidth}
          onEditorTextChange={w.setEditorText}
          onReferenceSelection={w.setReferenceSelection}
          onDraftSelection={w.setDraftSelection}
          onSave={w.saveEditorToDeliverable}
          onImitate={w.handleImitate}
          imitating={w.isImitating}
          imitateStyleId={w.imitateStyleId}
          onImitateStyleChange={w.setImitateStyleId}
          generationId={w.latestGenerationId}
        />
      )}

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
