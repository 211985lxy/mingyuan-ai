import type { ApiAsset, MaterialAssignment } from "@/types/api";

export function mergeWorkbenchAssets(assetGroups: ApiAsset[][]): ApiAsset[] {
  const merged = new Map<string, ApiAsset>();
  for (const group of assetGroups) {
    for (const asset of group) merged.set(asset.id, asset);
  }
  return [...merged.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function buildManualMaterialFromAsset(input: {
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
