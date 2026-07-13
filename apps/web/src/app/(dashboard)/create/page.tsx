"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  generateTopics,
  selectTopic,
} from "@/lib/api/client";
import type {
  ApiAsset,
  ApiVideoPackagingTemplate,
  ApiScript,
  BackgroundMusicSelection,
  MaterialAssignment,
  ApiTopicCard,
  ApiOpeningType,
  ApiCopyStructure,
  ApiEndingType,
} from "@/types/api";
import { getBlockingAiMaterials } from "@/lib/packaging-materials";
import { toast } from "sonner";
import { PageHeader, PhaseIndicator, ProductFlowOverview } from "@/features/create/components/workbench-overview";
import { PhaseGenerate, SubmissionPolling } from "@/features/create/components/generation-summary";
import { PhaseTopic } from "@/features/create/components/topic-phase";
import { PhaseCopywriting } from "@/features/create/components/copywriting-phase";
import { PhasePackaging } from "@/features/create/components/packaging-phase";
import { useCreateWorkbenchDraft } from "@/features/create/hooks/use-create-workbench-draft";
import { useCreateWorkbenchResources } from "@/features/create/hooks/use-create-workbench-resources";
import { useAiMaterialSync } from "@/features/create/hooks/use-ai-material-sync";
import { useVideoTaskPolling } from "@/features/create/hooks/use-video-task-polling";
import { useCreateWorkbenchActions } from "@/features/create/hooks/use-create-workbench-actions";

// ─── Phase Definitions ──────────────────────────────────

// ─── Types ──────────────────────────────────────────────

function isIncompleteManualMaterial(material: MaterialAssignment) {
  const isAiSource = material.source === "ai_pexels" || material.source === "ai_pixabay";
  return !isAiSource && !material.assetId;
}

// ─── Main Page Component ────────────────────────────────

export default function CreateVideoPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  // Phase state
  const [currentPhase, setCurrentPhase] = useState(0);

  // Hot topic from URL (from home page "追热点" button)
  const [hotTopicId, setHotTopicId] = useState<string | null>(null);
  const [hotTopicTitle, setHotTopicTitle] = useState<string | null>(null);

  // Phase 0: Topic Selection
  const [topicCards, setTopicCards] = useState<ApiTopicCard[]>([]);
  const [topicSelectionId, setTopicSelectionId] = useState<string | null>(null);
  const [selectedTopicIndex, setSelectedTopicIndex] = useState<number | null>(null);
  const [selectedTopicCard, setSelectedTopicCard] = useState<ApiTopicCard | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicRefreshCount, setTopicRefreshCount] = useState(0);

  // Phase 1: Copywriting
  const [openingTypes, setOpeningTypes] = useState<ApiOpeningType[]>([]);
  const [copyStructures, setCopyStructures] = useState<ApiCopyStructure[]>([]);
  const [endingTypes, setEndingTypes] = useState<ApiEndingType[]>([]);
  const [selectedOpeningCode, setSelectedOpeningCode] = useState<string | null>(null);
  const [selectedCopyStructureCode, setSelectedCopyStructureCode] = useState<string | null>(null);
  const [selectedEndingCode, setSelectedEndingCode] = useState<string | null>(null);
  const [fallbackTemplateId, setFallbackTemplateId] = useState<string | null>(null);
  const [generatedScripts, setGeneratedScripts] = useState<ApiScript[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);

  // Phase 2: Packaging
  const [packagingTemplates, setPackagingTemplates] = useState<ApiVideoPackagingTemplate[]>([]);
  const [packagingLoading, setPackagingLoading] = useState(false);
  const [packagingSyncing, setPackagingSyncing] = useState(false);
  const [packagingError, setPackagingError] = useState<string | null>(null);
  const [selectedPackagingTemplateId, setSelectedPackagingTemplateId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialAssignment[]>([]);
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundMusicSelection | null>(null);
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetLibraryError, setAssetLibraryError] = useState<string | null>(null);
  const assetsLoadedRef = useRef(false);
  const [materialAssistLoading, setMaterialAssistLoading] = useState(false);
  const [materialAssistError, setMaterialAssistError] = useState<string | null>(null);

  // Submission & polling
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dependency invalidation tracking
  const [staleWarning, setStaleWarning] = useState<string | null>(null);

  const { saveDraft, clearDraft } = useCreateWorkbenchDraft(
    {
      currentPhase,
      topicSelectionId,
      selectedTopicIndex,
      openingTypeCode: selectedOpeningCode,
      copyStructureCode: selectedCopyStructureCode,
      endingTypeCode: selectedEndingCode,
      selectedScriptId,
      editedScript,
      packagingTemplateId: selectedPackagingTemplateId,
      materials,
      backgroundMusic,
    },
    {
      setCurrentPhase,
      setTopicSelectionId,
      setSelectedTopicIndex,
      setSelectedOpeningCode,
      setSelectedCopyStructureCode,
      setSelectedEndingCode,
      setSelectedScriptId,
      setEditedScript,
      setSelectedPackagingTemplateId,
      setMaterials,
      setBackgroundMusic,
    },
  );

  // ─── Derived values ────────────────────────────────────

  const selectedPackaging = packagingTemplates.find((p) => p.id === selectedPackagingTemplateId) ?? null;
  const resolvedPackaging = selectedPackaging;
  const resolvedPackagingRecommendation = resolvedPackaging?.recommendation ?? null;
  const resolvedPackagingLabel = resolvedPackaging?.name ?? "未选择";
  const ipProfileReady = true;
  const hasThreeDPositioning = true;
  const blockingAiMaterials = useMemo(
    () => getBlockingAiMaterials(materials),
    [materials],
  );
  const incompleteManualMaterials = useMemo(
    () => materials.filter(isIncompleteManualMaterial),
    [materials],
  );

  // Readiness checks
  const phase0Ready = !!selectedTopicCard && !!topicSelectionId;
  const phase1Ready = !!selectedScriptId && !!editedScript.trim();
  const phase2Ready =
    !!resolvedPackaging
    && resolvedPackagingRecommendation?.tier !== "blocked";
  const phase3Ready = phase2Ready && !!editedScript.trim();

  // Read hot topic from URL params (from home page "追热点")
  useEffect(() => {
    const urlHotTopicId = searchParams.get("hotTopicId");
    const urlHotTopic = searchParams.get("hotTopic");
    if (urlHotTopicId) setHotTopicId(urlHotTopicId);
    if (urlHotTopic) setHotTopicTitle(decodeURIComponent(urlHotTopic));
  }, [searchParams]);

  const { loadAssets, loadPackagingTemplates } = useCreateWorkbenchResources({
    currentPhase,
    selectedScriptId,
    selectedCopyStructureCode,
    selectedPackagingTemplateId,
    packagingTemplates,
    assetsLoading,
    openingTypes,
    copyStructures,
    endingTypes,
    selectedEndingCode,
    assetsLoadedRef,
    setFallbackTemplateId,
    setPackagingTemplates,
    setPackagingLoading,
    setPackagingSyncing,
    setPackagingError,
    setSelectedPackagingTemplateId,
    setAssets,
    setAssetsLoading,
    setAssetLibraryError,
    setOpeningTypes,
    setCopyStructures,
    setEndingTypes,
    setSelectedEndingCode,
  });

  useAiMaterialSync(materials, setMaterials);

  useVideoTaskPolling(taskId, taskStatus, setTaskStatus, setTaskError);

  const {
    goToPhase,
    nextPhase,
    prevPhase,
    handleCopywritingOptionChange,
    handleScriptChange,
    handleEditedScriptChange,
    handlePackagingTemplateChange,
    handleMaterialAssetSelect,
    handleMaterialAssetUpload,
    handleBackgroundMusicSelect,
    handleBackgroundMusicUpload,
    handleGenerateMaterialSuggestions,
    handleGenerateScripts,
    handleProceedToPackaging,
    handleSubmit,
  } = useCreateWorkbenchActions({
    state: {
      currentPhase,
      generatedScripts,
      selectedScriptId,
      selectedPackagingTemplateId,
      selectedCopyStructureCode,
      selectedOpeningCode,
      selectedEndingCode,
      fallbackTemplateId,
      topicSelectionId,
      hotTopicId,
      hotTopicTitle,
      editedScript,
      packagingTemplates,
      materials,
      backgroundMusic,
      assets,
    },
    setters: {
      setCurrentPhase,
      setGeneratedScripts,
      setSelectedScriptId,
      setEditedScript,
      setSelectedPackagingTemplateId,
      setMaterials,
      setBackgroundMusic,
      setAssets,
      setAssetLibraryError,
      setMaterialAssistLoading,
      setMaterialAssistError,
      setTaskError,
      setIsGenerating,
      setIsDegraded,
      setIsSubmitting,
      setTaskId,
      setTaskStatus,
      setStaleWarning,
    },
    saveDraft,
    clearDraft,
  });

  // ─── Render ───────────────────────────────────────────

  if (taskId && !taskError) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <ProductFlowOverview
          ipProfileReady={ipProfileReady}
          hasThreeDPositioning={hasThreeDPositioning}
          topicReady={!!selectedTopicCard}
          scriptReady={!!selectedScriptId && !!editedScript.trim()}
          qualityChecked={false}
          hotTopicTitle={hotTopicTitle}
        />
        <SubmissionPolling taskStatus={taskStatus} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8">
      <PageHeader />
      <ProductFlowOverview
        ipProfileReady={ipProfileReady}
        hasThreeDPositioning={hasThreeDPositioning}
        topicReady={!!selectedTopicCard}
        scriptReady={!!selectedScriptId && !!editedScript.trim()}
        qualityChecked={!!selectedScriptId && !!editedScript.trim()}
        hotTopicTitle={hotTopicTitle}
      />
      <PhaseIndicator currentPhase={currentPhase} onPhaseClick={goToPhase} readiness={[phase0Ready, phase1Ready, phase2Ready, phase3Ready]} />

      {staleWarning && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-amber-800 font-medium">{staleWarning}</p>
              <Button type="button" variant="ghost" size="sm" className="mt-1 text-amber-700 cursor-pointer" onClick={() => setStaleWarning(null)}>
                我知道了
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentPhase === 0 && (
        <PhaseTopic
          topicCards={topicCards}
          topicSelectionId={topicSelectionId}
          selectedTopicIndex={selectedTopicIndex}
          selectedTopicCard={selectedTopicCard}
          topicLoading={topicLoading}
          topicRefreshCount={topicRefreshCount}
          hotTopicTitle={hotTopicTitle}
          ipProfileReady={ipProfileReady}
          ipProfileLoading={false}
          onGenerateTopics={async () => {
            setTopicLoading(true);
            try {
              const result = await generateTopics({ refreshCount: topicRefreshCount });
              setTopicCards(result.cards);
              setTopicSelectionId(result.topicSelectionId);
              setSelectedTopicIndex(null);
              setSelectedTopicCard(null);
              setTopicRefreshCount((c) => c + 1);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "选题生成失败，请重试");
            } finally {
              setTopicLoading(false);
            }
          }}
          onSelectTopic={async (index: number) => {
            const card = topicCards[index];
            if (!card || !topicSelectionId) return;
            setSelectedTopicIndex(index);
            setSelectedTopicCard(card);
            // Pre-fill copywriting codes from topic recommendation
            setSelectedOpeningCode(card.openingTypeCode);
            setSelectedCopyStructureCode(card.structureCode);
            try {
              await selectTopic(topicSelectionId, index);
            } catch {
              // Selection is saved locally even if API fails
            }
          }}
          onNext={nextPhase}
        />
      )}

      {currentPhase === 1 && (
        <PhaseCopywriting
          selectedTopicCard={selectedTopicCard}
          openingTypes={openingTypes}
          copyStructures={copyStructures}
          endingTypes={endingTypes}
          selectedOpeningCode={selectedOpeningCode}
          selectedCopyStructureCode={selectedCopyStructureCode}
          selectedEndingCode={selectedEndingCode}
          onSelectOpening={(code: string) => {
            setSelectedOpeningCode(code);
            handleCopywritingOptionChange();
          }}
          onSelectCopyStructure={(code: string) => {
            setSelectedCopyStructureCode(code);
            handleCopywritingOptionChange();
          }}
          onSelectEnding={(code: string) => {
            setSelectedEndingCode(code);
            handleCopywritingOptionChange();
          }}
          generatedScripts={generatedScripts}
          selectedScriptId={selectedScriptId}
          onSelectScript={handleScriptChange}
          editedScript={editedScript}
          onEditScript={handleEditedScriptChange}
          isGenerating={isGenerating}
          isDegraded={isDegraded}
          onGenerate={handleGenerateScripts}
          ipProfile={null}
          hotTopicTitle={hotTopicTitle}
          onNext={handleProceedToPackaging}
          onBack={prevPhase}
        />
      )}

      {currentPhase === 2 && (
        <PhasePackaging
          packagingTemplates={packagingTemplates}
          loading={packagingLoading}
          syncing={packagingSyncing}
          errorMessage={packagingError}
          selectedId={selectedPackagingTemplateId}
          onSelect={handlePackagingTemplateChange}
          onRetrySync={() => loadPackagingTemplates({ forceSync: true })}
          templateDefaultPackagingName={null}
          canProceed={phase2Ready}
          materials={materials}
          onMaterialsChange={setMaterials}
          backgroundMusic={backgroundMusic}
          onBackgroundMusicChange={setBackgroundMusic}
          assets={assets}
          assetsLoading={assetsLoading}
          assetLibraryError={assetLibraryError}
          materialAssistLoading={materialAssistLoading}
          materialAssistError={materialAssistError}
          selectedRecommendation={resolvedPackagingRecommendation}
          blockingAiCount={blockingAiMaterials.length}
          incompleteManualCount={incompleteManualMaterials.length}
          onRefreshAssets={loadAssets}
          onGenerateMaterials={handleGenerateMaterialSuggestions}
          onMaterialAssetSelect={handleMaterialAssetSelect}
          onMaterialAssetUpload={handleMaterialAssetUpload}
          onBackgroundMusicSelect={handleBackgroundMusicSelect}
          onBackgroundMusicUpload={handleBackgroundMusicUpload}
          editedScript={editedScript}
          onNext={nextPhase}
          onBack={prevPhase}
        />
      )}

      {currentPhase === 3 && (
        <PhaseGenerate
          resolvedPackagingLabel={resolvedPackagingLabel}
          selectedPackagingRecommendation={resolvedPackagingRecommendation}
          hasResolvedPackaging={phase2Ready}
          editedScript={editedScript}
          materials={materials}
          backgroundMusic={backgroundMusic}
          blockingAiCount={blockingAiMaterials.length}
          incompleteManualCount={incompleteManualMaterials.length}
          isSubmitting={isSubmitting}
          taskError={taskError}
          onSubmit={handleSubmit}
          onSaveDraft={saveDraft}
          onBack={prevPhase}
        />
      )}
    </div>
  );
}

// ─── Phase 0: 选题 (Planning Layer) ─────────────────────

// ─── Phase 1: 定文案 (Copywriting Layer) ────────────────

// ─── Phase 2: 定包装 (Packaging Layer) ──────────────────
