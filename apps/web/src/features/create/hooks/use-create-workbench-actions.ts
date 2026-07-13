"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  generatePackagingMaterialSuggestions,
  generateScripts as apiGenerateScripts,
  registerAsset,
  updateScript,
  uploadFileToStorage,
} from "@/lib/api/client";
import { mapCopyToVideoStructure } from "@/lib/copy-structure-mapping";
import { splitMaterialAssignments } from "@/lib/packaging-materials";
import type {
  ApiAsset,
  ApiScript,
  ApiVideoPackagingTemplate,
  BackgroundMusicSelection,
  MaterialAssignment,
} from "@/types/api";
import { isAiMaterial } from "@/features/create/components/packaging-material-preview";
import type { CreateWorkbenchDraftState } from "@/features/create/hooks/use-create-workbench-draft";
import { buildManualMaterialFromAsset, mergeWorkbenchAssets } from "@/features/create/services/create-workbench-assets";
import { submitCreateWorkbench } from "@/features/create/services/create-workbench-submission";
import { toast } from "sonner";

type Setter<T> = Dispatch<SetStateAction<T>>;
type SaveDraft = (overrides?: Partial<CreateWorkbenchDraftState>) => void;

interface CreateWorkbenchActionsState {
  currentPhase: number;
  generatedScripts: ApiScript[];
  selectedScriptId: string | null;
  selectedPackagingTemplateId: string | null;
  selectedCopyStructureCode: string | null;
  selectedOpeningCode: string | null;
  selectedEndingCode: string | null;
  fallbackTemplateId: string | null;
  topicSelectionId: string | null;
  hotTopicId: string | null;
  hotTopicTitle: string | null;
  editedScript: string;
  packagingTemplates: ApiVideoPackagingTemplate[];
  materials: MaterialAssignment[];
  backgroundMusic: BackgroundMusicSelection | null;
  assets: ApiAsset[];
}

interface CreateWorkbenchActionSetters {
  setCurrentPhase: Setter<number>;
  setGeneratedScripts: Setter<ApiScript[]>;
  setSelectedScriptId: Setter<string | null>;
  setEditedScript: Setter<string>;
  setSelectedPackagingTemplateId: Setter<string | null>;
  setMaterials: Setter<MaterialAssignment[]>;
  setBackgroundMusic: Setter<BackgroundMusicSelection | null>;
  setAssets: Setter<ApiAsset[]>;
  setAssetLibraryError: Setter<string | null>;
  setMaterialAssistLoading: Setter<boolean>;
  setMaterialAssistError: Setter<string | null>;
  setTaskError: Setter<string | null>;
  setIsGenerating: Setter<boolean>;
  setIsDegraded: Setter<boolean>;
  setIsSubmitting: Setter<boolean>;
  setTaskId: Setter<string | null>;
  setTaskStatus: Setter<string | null>;
  setStaleWarning: Setter<string | null>;
}

interface UseCreateWorkbenchActionsParams {
  state: CreateWorkbenchActionsState;
  setters: CreateWorkbenchActionSetters;
  saveDraft: SaveDraft;
  clearDraft: () => void;
}

export function useCreateWorkbenchActions(params: UseCreateWorkbenchActionsParams) {
  const { state, setters, saveDraft, clearDraft } = params;
  const {
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
  } = state;
  const {
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
  } = setters;

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
    const script = generatedScripts.find((item) => item.id === scriptId);
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

    setAssets((current) => mergeWorkbenchAssets([[asset], current]));
    return asset;
  }

  function handleMaterialAssetSelect(index: number, assetId: string) {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;

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
    if (!currentMaterial) return;

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
    if (!asset) return;

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

    if (!selectedPackagingTemplateId) {
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
        packagingTemplateId: selectedPackagingTemplateId,
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

    setIsGenerating(true);
    setGeneratedScripts([]);
    setSelectedScriptId(null);
    setEditedScript("");
    setStaleWarning(null);
    try {
      const result = await apiGenerateScripts({
        templateId: fallbackTemplateId,
        structureId: mapCopyToVideoStructure(selectedCopyStructureCode),
        inputs: {},
        topicSelectionId,
        openingTypeCode: selectedOpeningCode,
        copyStructureCode: selectedCopyStructureCode,
        endingTypeCode: selectedEndingCode,
        ...(hotTopicId ? { hotTopicId, hotTopic: hotTopicTitle } : {}),
      });
      setGeneratedScripts(result.scripts);
      setIsDegraded(result.isDegraded ?? false);
      toast.success(`已生成 ${result.scripts.length} 条文案，请选择一条`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "文案生成失败，请重试";
      setTaskError(message);
      toast.error(message.includes("超时") ? "文案生成超时，请稍后重试" : "文案生成失败，请重试");
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
    } catch {}
  }

  async function handleProceedToPackaging() {
    if (!selectedScriptId || !editedScript.trim()) return;
    await handleSaveScript();
    nextPhase();
  }

  async function handleSubmit() {
    if (!editedScript.trim() || !selectedScriptId) return;
    setIsSubmitting(true);
    setTaskError(null);
    try {
      const task = await submitCreateWorkbench({
        selectedScriptId,
        editedScript,
        selectedPackagingTemplateId,
        selectedCopyStructureCode,
        fallbackTemplateId,
        packagingTemplates,
        materials,
        backgroundMusic,
        saveScript: handleSaveScript,
      });
      setTaskId(task.id);
      setTaskStatus(task.status);
      clearDraft();
      if (task.status === "queued") {
        toast.info("当前使用人数较多，您的视频已排队，将自动开始生成");
      } else {
        toast.success("视频任务已提交，正在生成中");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交失败，请重试";
      setTaskError(message);
      toast.error(message);
      setIsSubmitting(false);
    }
  }

  function goToPhase(phase: number) {
    if (phase < currentPhase) setCurrentPhase(phase);
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

  return {
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
  };
}
