import type { MaterialAssignment } from "@/types/api";

export const SAFE_AI_MATERIAL_ROLES = [
  "product_detail",
  "store_environment",
  "process",
] as const;

export const MANUAL_ONLY_MATERIAL_ROLES = [
  "customer_case",
  "qualification",
  "before_after",
] as const;

export type SafeAiMaterialRole = (typeof SAFE_AI_MATERIAL_ROLES)[number];
export type ManualOnlyMaterialRole = (typeof MANUAL_ONLY_MATERIAL_ROLES)[number];

export function getSuggestedMaterialCount(scriptContent: string): number {
  const estimatedDuration = Math.max(8, scriptContent.trim().length / 3.5);
  const targetMaterialDuration = estimatedDuration * 0.35;
  return Math.max(3, Math.min(15, Math.round(targetMaterialDuration / 2)));
}

export function isAiSuggestedMaterial(
  material: MaterialAssignment,
): boolean {
  return material.source === "ai_pexels" || material.source === "ai_pixabay";
}

export function isMaterialReadyForProduction(
  material: MaterialAssignment,
): boolean {
  return !isAiSuggestedMaterial(material) || material.ossStatus === "ready";
}

export function getBlockingAiMaterials(
  materials: MaterialAssignment[],
): MaterialAssignment[] {
  return materials.filter((material) => !isMaterialReadyForProduction(material));
}

export function splitMaterialAssignments(
  materials: MaterialAssignment[],
): {
  manual: MaterialAssignment[];
  ai: MaterialAssignment[];
} {
  return {
    manual: materials.filter((material) => !isAiSuggestedMaterial(material)),
    ai: materials.filter((material) => isAiSuggestedMaterial(material)),
  };
}

export function normalizeMaterialAssignment(
  material: MaterialAssignment,
): MaterialAssignment {
  return {
    ...material,
    role: material.role.trim(),
    fileUrl: material.fileUrl.trim(),
    type: material.type,
    source: material.source,
    assetId: material.assetId ?? null,
    thumbnailUrl: material.thumbnailUrl ?? null,
    previewUrl: material.previewUrl ?? null,
    pexelsId: material.pexelsId ?? null,
    searchQuery: material.searchQuery?.trim() || null,
    ossStatus: material.ossStatus ?? null,
  };
}
