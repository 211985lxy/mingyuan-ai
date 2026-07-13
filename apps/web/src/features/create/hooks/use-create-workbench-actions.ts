"use client";

import { createWorkbenchMaterialActions } from "@/features/create/actions/create-workbench-material-actions";
import { createWorkbenchNavigationActions } from "@/features/create/actions/create-workbench-navigation-actions";
import { createWorkbenchPackagingActions } from "@/features/create/actions/create-workbench-packaging-actions";
import { createWorkbenchScriptGenerationActions, createWorkbenchScriptSelectionActions } from "@/features/create/actions/create-workbench-script-actions";
import type { CreateWorkbenchActionsParams } from "@/features/create/hooks/create-workbench-action-contracts";
import { submitCreateWorkbench } from "@/features/create/services/create-workbench-submission";
import { toast } from "sonner";

export function useCreateWorkbenchActions(params: CreateWorkbenchActionsParams) {
  const { state, setters, clearDraft } = params;
  const navigation = createWorkbenchNavigationActions(params);
  const packaging = createWorkbenchPackagingActions(params);
  const materials = createWorkbenchMaterialActions(params);
  const scriptSelection = createWorkbenchScriptSelectionActions(params, packaging.clearAiPackagingMaterials);
  const scriptGeneration = createWorkbenchScriptGenerationActions(params, navigation.nextPhase);

  async function handleSubmit() {
    if (!state.editedScript.trim() || !state.selectedScriptId) return;
    setters.setIsSubmitting(true);
    setters.setTaskError(null);
    try {
      const task = await submitCreateWorkbench({
        selectedScriptId: state.selectedScriptId,
        editedScript: state.editedScript,
        selectedPackagingTemplateId: state.selectedPackagingTemplateId,
        selectedCopyStructureCode: state.selectedCopyStructureCode,
        fallbackTemplateId: state.fallbackTemplateId,
        packagingTemplates: state.packagingTemplates,
        materials: state.materials,
        backgroundMusic: state.backgroundMusic,
        saveScript: scriptGeneration.handleSaveScript,
      });
      setters.setTaskId(task.id);
      setters.setTaskStatus(task.status);
      clearDraft();
      if (task.status === "queued") toast.info("当前使用人数较多，您的视频已排队，将自动开始生成");
      else toast.success("视频任务已提交，正在生成中");
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交失败，请重试";
      setters.setTaskError(message);
      toast.error(message);
      setters.setIsSubmitting(false);
    }
  }

  return {
    ...navigation,
    ...scriptSelection,
    ...materials,
    handlePackagingTemplateChange: packaging.handlePackagingTemplateChange,
    handleGenerateMaterialSuggestions: packaging.handleGenerateMaterialSuggestions,
    handleGenerateScripts: scriptGeneration.handleGenerateScripts,
    handleProceedToPackaging: scriptGeneration.handleProceedToPackaging,
    handleSubmit,
  };
}
