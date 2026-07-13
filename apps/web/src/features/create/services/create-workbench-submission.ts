import { createProductionPlan, createVideoTask } from "@/lib/api/client"
import { mapCopyToVideoStructure } from "@/lib/copy-structure-mapping"
import { getBlockingAiMaterials } from "@/lib/packaging-materials"
import { buildPackagingRecommendationContext } from "@/lib/video-template-config"
import { isAiMaterial } from "@/features/create/components/packaging-material-preview"
import type { ApiVideoPackagingTemplate, BackgroundMusicSelection, MaterialAssignment } from "@/types/api"

interface SubmitWorkbenchInput {
  selectedScriptId: string
  editedScript: string
  selectedPackagingTemplateId: string | null
  selectedCopyStructureCode: string | null
  fallbackTemplateId: string | null
  packagingTemplates: ApiVideoPackagingTemplate[]
  materials: MaterialAssignment[]
  backgroundMusic: BackgroundMusicSelection | null
  saveScript: () => Promise<void>
}

function resolveSubmissionConfig(input: SubmitWorkbenchInput) {
  const blockingMaterials = getBlockingAiMaterials(input.materials)
  if (blockingMaterials.length > 0) throw new Error("AI 补充素材正在准备中，请稍候再提交")

  const packaging = input.packagingTemplates.find((item) => item.id === input.selectedPackagingTemplateId) ?? null
  if (!packaging) throw new Error("请先选择包装模板")

  const recommendation = packaging.recommendation ?? null
  if (recommendation?.tier === "blocked") {
    throw new Error(recommendation.blockingReasons?.[0] ?? "当前包装模板与这条视频存在真实能力冲突，请改选其他模板")
  }
  if (!packaging.shanjianId) throw new Error("当前视频没有可用的包装 styleId")

  const materials = input.materials.filter((item) => isAiMaterial(item) || !!item.assetId)
  if (materials.length === 0) throw new Error("请先在包装阶段补充至少一个可用素材，再生成视频")

  const structureId = input.selectedCopyStructureCode ? mapCopyToVideoStructure(input.selectedCopyStructureCode) : null
  return { packaging, recommendation, materials, structureId, styleId: packaging.shanjianId }
}

export async function submitCreateWorkbench(input: SubmitWorkbenchInput) {
  const config = resolveSubmissionConfig(input)
  await input.saveScript()

  const plan = await createProductionPlan({
    scriptId: input.selectedScriptId,
    contentTemplateId: input.fallbackTemplateId || undefined,
    packagingTemplateId: input.selectedPackagingTemplateId || undefined,
    structureId: config.structureId || undefined,
    styleId: config.styleId,
    materials: config.materials,
    backgroundMusic: input.backgroundMusic ?? undefined,
    packRules: config.recommendation?.presetPackRules ?? undefined,
    processRules: config.recommendation?.presetProcessRules ?? undefined,
    recommendationContext: buildPackagingRecommendationContext({
      structureId: config.structureId,
      scriptId: input.selectedScriptId,
      packagingTemplateId: config.packaging.id,
      recommendation: config.recommendation,
    }),
    videoType: "broadcast_mixcut",
  })

  return createVideoTask({
    type: "broadcast_mixcut",
    scriptId: input.selectedScriptId,
    scriptContent: input.editedScript.trim(),
    productionPlanId: plan.id,
    styleId: config.styleId,
  })
}
