import { generatePackagingMaterialSuggestions } from "@/lib/api/client";
import { mapCopyToVideoStructure } from "@/lib/copy-structure-mapping";
import { splitMaterialAssignments } from "@/lib/packaging-materials";
import { isAiMaterial } from "@/features/create/components/packaging-material-preview";
import type { CreateWorkbenchActionsParams } from "@/features/create/hooks/create-workbench-action-contracts";

export function createWorkbenchPackagingActions({ state, setters }: CreateWorkbenchActionsParams) {
  function clearAiPackagingMaterials() {
    setters.setMaterials((current) => splitMaterialAssignments(current).manual);
    setters.setMaterialAssistError(null);
  }

  function handlePackagingTemplateChange(id: string) {
    const template = state.packagingTemplates.find((item) => item.id === id) ?? null;
    if (template?.recommendation?.tier === "blocked") {
      setters.setStaleWarning(template.recommendation.blockingReasons?.[0] ?? "当前模板与这条视频的表达要求存在真实能力冲突，请改选其他模板。");
      return;
    }
    if (state.selectedPackagingTemplateId && state.selectedPackagingTemplateId !== id && state.materials.some(isAiMaterial)) {
      setters.setStaleWarning("你更换了包装模板，现有 AI 补充素材已清空，请重新生成或改用手动素材。");
      clearAiPackagingMaterials();
    }
    setters.setSelectedPackagingTemplateId(id);
  }

  async function handleGenerateMaterialSuggestions() {
    if (!state.selectedScriptId) return setters.setMaterialAssistError("请先完成文案选择，再生成 AI 补充素材。");
    if (!state.selectedPackagingTemplateId) return setters.setMaterialAssistError("请先确认包装模板，再生成 AI 补充素材。");
    setters.setMaterialAssistLoading(true);
    setters.setMaterialAssistError(null);
    try {
      const response = await generatePackagingMaterialSuggestions({
        scriptId: state.selectedScriptId,
        structureId: state.selectedCopyStructureCode ? mapCopyToVideoStructure(state.selectedCopyStructureCode) : undefined,
        packagingTemplateId: state.selectedPackagingTemplateId,
        scriptContentDraft: state.editedScript.trim(),
        existingItems: state.materials,
      });
      setters.setMaterials((current) => [...splitMaterialAssignments(current).manual, ...response.suggestions]);
    } catch (error) {
      setters.setMaterialAssistError(error instanceof Error ? error.message : "AI 素材补充失败，请稍后重试");
    } finally {
      setters.setMaterialAssistLoading(false);
    }
  }

  return { clearAiPackagingMaterials, handlePackagingTemplateChange, handleGenerateMaterialSuggestions };
}
