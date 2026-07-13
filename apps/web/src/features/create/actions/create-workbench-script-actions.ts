import { generateScripts, updateScript } from "@/lib/api/client";
import { mapCopyToVideoStructure } from "@/lib/copy-structure-mapping";
import { isAiMaterial } from "@/features/create/components/packaging-material-preview";
import type { CreateWorkbenchActionsParams } from "@/features/create/hooks/create-workbench-action-contracts";
import { toast } from "sonner";

export function createWorkbenchScriptSelectionActions(params: CreateWorkbenchActionsParams, clearAiPackagingMaterials: () => void) {
  const { state, setters } = params;

  function handleCopywritingOptionChange() {
    if (state.generatedScripts.length === 0 && !state.selectedScriptId) return;
    setters.setStaleWarning("你更换了文案选项，之前生成的文案需要重新生成。");
    setters.setGeneratedScripts([]);
    setters.setSelectedScriptId(null);
    setters.setEditedScript("");
    setters.setSelectedPackagingTemplateId(null);
    clearAiPackagingMaterials();
  }

  function handleScriptChange(scriptId: string) {
    const script = state.generatedScripts.find((item) => item.id === scriptId);
    if (!script) return;
    setters.setSelectedScriptId(scriptId);
    setters.setEditedScript(script.content);
    if (state.selectedPackagingTemplateId || state.materials.some(isAiMaterial)) {
      setters.setStaleWarning("你选择了不同的文案，原来的包装方案已失效，请重新确认包装模板。");
      setters.setSelectedPackagingTemplateId(null);
      clearAiPackagingMaterials();
    }
  }

  function handleEditedScriptChange(value: string) {
    setters.setEditedScript(value);
    if (value.trim() !== state.editedScript.trim() && (state.selectedPackagingTemplateId || state.materials.some(isAiMaterial))) {
      setters.setStaleWarning("你修改了文案内容，原来的包装方案已失效，请重新确认包装模板。");
      setters.setSelectedPackagingTemplateId(null);
      clearAiPackagingMaterials();
    }
  }

  return { handleCopywritingOptionChange, handleScriptChange, handleEditedScriptChange };
}

export function createWorkbenchScriptGenerationActions(params: CreateWorkbenchActionsParams, nextPhase: () => void) {
  const { state, setters } = params;

  async function handleGenerateScripts() {
    if (!state.selectedOpeningCode || !state.selectedCopyStructureCode || !state.selectedEndingCode) return setters.setTaskError("请先选择开场类型、文案结构和结尾类型");
    if (!state.fallbackTemplateId) return setters.setTaskError("暂无可用的模板，请稍后重试");
    setters.setIsGenerating(true);
    setters.setGeneratedScripts([]);
    setters.setSelectedScriptId(null);
    setters.setEditedScript("");
    setters.setStaleWarning(null);
    try {
      const result = await generateScripts({
        templateId: state.fallbackTemplateId,
        structureId: mapCopyToVideoStructure(state.selectedCopyStructureCode),
        inputs: {},
        topicSelectionId: state.topicSelectionId,
        openingTypeCode: state.selectedOpeningCode,
        copyStructureCode: state.selectedCopyStructureCode,
        endingTypeCode: state.selectedEndingCode,
        ...(state.hotTopicId ? { hotTopicId: state.hotTopicId, hotTopic: state.hotTopicTitle } : {}),
      });
      setters.setGeneratedScripts(result.scripts);
      setters.setIsDegraded(result.isDegraded ?? false);
      toast.success(`已生成 ${result.scripts.length} 条文案，请选择一条`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "文案生成失败，请重试";
      setters.setTaskError(message);
      toast.error(message.includes("超时") ? "文案生成超时，请稍后重试" : "文案生成失败，请重试");
    } finally {
      setters.setIsGenerating(false);
    }
  }

  async function handleSaveScript() {
    if (!state.selectedScriptId || !state.editedScript.trim()) return;
    try { await updateScript(state.selectedScriptId, { content: state.editedScript.trim(), status: "selected" }); } catch {}
  }

  async function handleProceedToPackaging() {
    if (!state.selectedScriptId || !state.editedScript.trim()) return;
    await handleSaveScript();
    nextPhase();
  }

  return { handleGenerateScripts, handleSaveScript, handleProceedToPackaging };
}
