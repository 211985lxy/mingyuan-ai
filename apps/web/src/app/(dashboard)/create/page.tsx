"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Eye,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  generateScripts as apiGenerateScripts,
  updateScript,
  createProductionPlan,
  createVideoTask,
  getVideoTask,
  uploadFileToStorage,
  registerAsset,
  generatePackagingMaterialSuggestions,
  getPexelsMedia,
  generateTopics,
  selectTopic,
} from "@/lib/api/client";
import { buildPackagingRecommendationContext } from "@/lib/video-template-config";
import { mapCopyToVideoStructure } from "@/lib/copy-structure-mapping";
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
import {
  getBlockingAiMaterials,
  splitMaterialAssignments,
} from "@/lib/packaging-materials";
import { toast } from "sonner";
import { PageHeader, PhaseIndicator, ProductFlowOverview } from "@/features/create/components/workbench-overview";
import { PhaseGenerate, SubmissionPolling } from "@/features/create/components/generation-summary";
import { PhaseTopic } from "@/features/create/components/topic-phase";
import { PhaseCopywriting } from "@/features/create/components/copywriting-phase";
import { PhasePackaging } from "@/features/create/components/packaging-phase";
import { isAiMaterial } from "@/features/create/components/packaging-material-preview";
import { useCreateWorkbenchDraft } from "@/features/create/hooks/use-create-workbench-draft";
import { useCreateWorkbenchResources } from "@/features/create/hooks/use-create-workbench-resources";
import { useAiMaterialSync } from "@/features/create/hooks/use-ai-material-sync";
import { useVideoTaskPolling } from "@/features/create/hooks/use-video-task-polling";

// ─── Phase Definitions ──────────────────────────────────

function mergeAssets(assetGroups: ApiAsset[][]): ApiAsset[] {
  const merged = new Map<string, ApiAsset>();
  for (const group of assetGroups) {
    for (const asset of group) {
      merged.set(asset.id, asset);
    }
  }

  return [...merged.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function isIncompleteManualMaterial(material: MaterialAssignment) {
  return !isAiMaterial(material) && !material.assetId;
}

function buildManualMaterialFromAsset(input: {
  role: string;
  asset: ApiAsset;
  source: "manual_library" | "manual_upload";
  type: "image" | "video";
}): MaterialAssignment {
  return {
    role: input.role,
    type: input.type,
    source: input.source,
    assetId: input.asset.id,
    fileUrl: input.asset.url,
    previewUrl: input.asset.url,
    thumbnailUrl: input.asset.url,
  };
}

// ─── Types ──────────────────────────────────────────────

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

  // ─── Dependency Invalidation ──────────────────────────

  function clearAiPackagingMaterials() {
    setMaterials((current) => splitMaterialAssignments(current).manual);
    setMaterialAssistError(null);
  }

  function handleCopywritingOptionChange() {
    if (generatedScripts.length > 0 || selectedScriptId) {
      setStaleWarning("你更换了文案选项，之前生成的文案需要重新生成。");
      setGeneratedScripts([]);
      setSelectedScriptId(null);
      setEditedScript("");
      setSelectedPackagingTemplateId(null);
      clearAiPackagingMaterials();
    }
  }

  function handleScriptChange(scriptId: string) {
    const script = generatedScripts.find((s) => s.id === scriptId);
    if (!script) return;
    setSelectedScriptId(scriptId);
    setEditedScript(script.content);
    if (selectedPackagingTemplateId || materials.some((item) => isAiMaterial(item))) {
      setStaleWarning("你选择了不同的文案，原来的包装方案已失效，请重新确认包装模板。");
      setSelectedPackagingTemplateId(null);
      clearAiPackagingMaterials();
    }
  }

  function handleEditedScriptChange(nextValue: string) {
    setEditedScript(nextValue);
    if (
      nextValue.trim() !== editedScript.trim()
      && (selectedPackagingTemplateId || materials.some((item) => isAiMaterial(item)))
    ) {
      setStaleWarning("你修改了文案内容，原来的包装方案已失效，请重新确认包装模板。");
      setSelectedPackagingTemplateId(null);
      clearAiPackagingMaterials();
    }
  }

  function handlePackagingTemplateChange(id: string) {
    const targetTemplate = packagingTemplates.find((template) => template.id === id) ?? null;
    if (targetTemplate?.recommendation?.tier === "blocked") {
      setStaleWarning(
        targetTemplate.recommendation.blockingReasons?.[0]
          ?? "当前模板与这条视频的表达要求存在真实能力冲突，请改选其他模板。",
      );
      return;
    }

    if (
      selectedPackagingTemplateId
      && selectedPackagingTemplateId !== id
      && materials.some((item) => isAiMaterial(item))
    ) {
      setStaleWarning("你更换了包装模板，现有 AI 补充素材已清空，请重新生成或改用手动素材。");
      clearAiPackagingMaterials();
    }
    setSelectedPackagingTemplateId(id);
  }

  // ─── Handlers ─────────────────────────────────────────

  async function uploadManagedAsset(
    file: File,
    assetType: "image" | "video" | "music",
  ): Promise<ApiAsset> {
    setAssetLibraryError(null);
    const url = await uploadFileToStorage(file);
    const asset = await registerAsset({
      name: file.name,
      assetType,
      url,
      size: file.size || null,
    });

    setAssets((current) => mergeAssets([[asset], current]));
    return asset;
  }

  function handleMaterialAssetSelect(index: number, assetId: string) {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) {
      return;
    }

    setMaterials((current) =>
      current.map((material, materialIndex) =>
        materialIndex === index
          ? buildManualMaterialFromAsset({
              role: material.role,
              asset,
              source: "manual_library",
              type: asset.assetType === "video" ? "video" : "image",
            })
          : material,
      ),
    );
  }

  async function handleMaterialAssetUpload(
    index: number,
    file: File,
    assetType: "image" | "video",
  ) {
    const currentMaterial = materials[index];
    if (!currentMaterial) {
      return;
    }

    const asset = await uploadManagedAsset(file, assetType);
    setMaterials((current) =>
      current.map((material, materialIndex) =>
        materialIndex === index
          ? buildManualMaterialFromAsset({
              role: material.role,
              asset,
              source: "manual_upload",
              type: assetType,
            })
          : material,
      ),
    );
  }

  function handleBackgroundMusicSelect(assetId: string) {
    const asset = assets.find((item) => item.id === assetId && item.assetType === "music");
    if (!asset) {
      return;
    }

    setBackgroundMusic({
      audioUrl: asset.url,
      assetId: asset.id,
      volume: backgroundMusic?.volume ?? 50,
      source: "manual_library",
    });
  }

  async function handleBackgroundMusicUpload(file: File) {
    const asset = await uploadManagedAsset(file, "music");
    setBackgroundMusic({
      audioUrl: asset.url,
      assetId: asset.id,
      volume: backgroundMusic?.volume ?? 50,
      source: "manual_upload",
    });
  }

  async function handleGenerateMaterialSuggestions() {
    if (!selectedScriptId) {
      setMaterialAssistError("请先完成文案选择，再生成 AI 补充素材。");
      return;
    }

    const resolvedPackagingId = selectedPackagingTemplateId;
    if (!resolvedPackagingId) {
      setMaterialAssistError("请先确认包装模板，再生成 AI 补充素材。");
      return;
    }

    const mappedStructureId = selectedCopyStructureCode
      ? mapCopyToVideoStructure(selectedCopyStructureCode)
      : undefined;

    setMaterialAssistLoading(true);
    setMaterialAssistError(null);

    try {
      const response = await generatePackagingMaterialSuggestions({
        scriptId: selectedScriptId,
        structureId: mappedStructureId,
        packagingTemplateId: resolvedPackagingId,
        scriptContentDraft: editedScript.trim(),
        existingItems: materials,
      });

      setMaterials((current) => {
        const { manual } = splitMaterialAssignments(current);
        return [...manual, ...response.suggestions];
      });
    } catch (error) {
      setMaterialAssistError(
        error instanceof Error ? error.message : "AI 素材补充失败，请稍后重试",
      );
    } finally {
      setMaterialAssistLoading(false);
    }
  }

  async function handleGenerateScripts() {
    if (!selectedOpeningCode || !selectedCopyStructureCode || !selectedEndingCode) {
      setTaskError("请先选择开场类型、文案结构和结尾类型");
      return;
    }
    if (!fallbackTemplateId) {
      setTaskError("暂无可用的模板，请稍后重试");
      return;
    }

    const mappedStructureId = mapCopyToVideoStructure(selectedCopyStructureCode);

    setIsGenerating(true);
    setGeneratedScripts([]);
    setSelectedScriptId(null);
    setEditedScript("");
    setStaleWarning(null);
    try {
      const result = await apiGenerateScripts({
        templateId: fallbackTemplateId,
        structureId: mappedStructureId,
        inputs: {},
        topicSelectionId: topicSelectionId,
        openingTypeCode: selectedOpeningCode,
        copyStructureCode: selectedCopyStructureCode,
        endingTypeCode: selectedEndingCode,
        ...(hotTopicId ? { hotTopicId, hotTopic: hotTopicTitle } : {}),
      });
      setGeneratedScripts(result.scripts);
      setIsDegraded(result.isDegraded ?? false);
      toast.success(`已生成 ${result.scripts.length} 条文案，请选择一条`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "文案生成失败，请重试";
      setTaskError(msg);
      toast.error(msg.includes("超时") ? "文案生成超时，请稍后重试" : "文案生成失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveScript() {
    if (!selectedScriptId || !editedScript.trim()) return;
    try {
      await updateScript(selectedScriptId, {
        content: editedScript.trim(),
        status: "selected",
      });
    } catch { /* ignore save errors, script content is in state */ }
  }

  async function handleProceedToPackaging() {
    if (!selectedScriptId || !editedScript.trim()) {
      return;
    }

    await handleSaveScript();
    nextPhase();
  }

  async function handleSubmit() {
    if (!editedScript.trim() || !selectedScriptId) return;
    setIsSubmitting(true);
    setTaskError(null);
    try {
      if (blockingAiMaterials.length > 0) {
        throw new Error("AI 补充素材正在准备中，请稍候再提交");
      }

      // Save script first
      await handleSaveScript();

      if (!selectedPackaging) {
        throw new Error("请先选择包装模板");
      }

      if (resolvedPackagingRecommendation?.tier === "blocked") {
        throw new Error(
          resolvedPackagingRecommendation.blockingReasons?.[0]
            ?? "当前包装模板与这条视频存在真实能力冲突，请改选其他模板",
        );
      }

      const styleId = selectedPackaging.shanjianId;
      if (!styleId) {
        throw new Error("当前视频没有可用的包装 styleId");
      }

      const usableMaterials = materials.filter((m) => isAiMaterial(m) || !!m.assetId);
      if (usableMaterials.length === 0) {
        throw new Error("请先在包装阶段补充至少一个可用素材，再生成视频");
      }

      const mappedStructureId = selectedCopyStructureCode
        ? mapCopyToVideoStructure(selectedCopyStructureCode)
        : null;

      const recommendationContext = buildPackagingRecommendationContext({
        structureId: mappedStructureId,
        scriptId: selectedScriptId,
        packagingTemplateId: resolvedPackaging?.id ?? null,
        recommendation: resolvedPackagingRecommendation,
      });

      // Create production plan
      const plan = await createProductionPlan({
        scriptId: selectedScriptId,
        contentTemplateId: fallbackTemplateId || undefined,
        packagingTemplateId: selectedPackagingTemplateId || undefined,
        structureId: mappedStructureId || undefined,
        styleId,
        materials: usableMaterials,
        backgroundMusic: backgroundMusic ?? undefined,
        packRules: resolvedPackagingRecommendation?.presetPackRules ?? undefined,
        processRules: resolvedPackagingRecommendation?.presetProcessRules ?? undefined,
        recommendationContext,
        videoType: "broadcast_mixcut",
      });

      // Create video task with production plan
      const taskParams: Record<string, unknown> = {
        type: "broadcast_mixcut",
        scriptId: selectedScriptId,
        scriptContent: editedScript.trim(),
        productionPlanId: plan.id,
        styleId,
      };

      const task = await createVideoTask(taskParams);
      setTaskId(task.id);
      setTaskStatus(task.status);
      clearDraft();
      if (task.status === "queued") {
        toast.info("当前使用人数较多，您的视频已排队，将自动开始生成");
      } else {
        toast.success("视频任务已提交，正在生成中");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "提交失败，请重试";
      setTaskError(msg);
      toast.error(msg);
      setIsSubmitting(false);
    }
  }

  // ─── Phase navigation ─────────────────────────────────

  function goToPhase(phase: number) {
    if (phase < currentPhase) {
      setCurrentPhase(phase);
    }
  }

  function nextPhase() {
    const next = Math.min(currentPhase + 1, 3);
    saveDraft({ currentPhase: next });
    setStaleWarning(null);
    setCurrentPhase(next);
  }

  function prevPhase() {
    const previous = Math.max(currentPhase - 1, 0);
    saveDraft({ currentPhase: previous });
    setCurrentPhase(previous);
  }

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
