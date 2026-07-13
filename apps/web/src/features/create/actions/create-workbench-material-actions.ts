import { registerAsset, uploadFileToStorage } from "@/lib/api/client";
import { buildManualMaterialFromAsset, mergeWorkbenchAssets } from "@/features/create/services/create-workbench-assets";
import type { CreateWorkbenchActionsParams } from "@/features/create/hooks/create-workbench-action-contracts";
import type { ApiAsset } from "@/types/api";

export function createWorkbenchMaterialActions({ state, setters }: CreateWorkbenchActionsParams) {
  async function uploadManagedAsset(file: File, assetType: "image" | "video" | "music"): Promise<ApiAsset> {
    setters.setAssetLibraryError(null);
    const url = await uploadFileToStorage(file);
    const asset = await registerAsset({ name: file.name, assetType, url, size: file.size || null });
    setters.setAssets((current) => mergeWorkbenchAssets([[asset], current]));
    return asset;
  }

  function handleMaterialAssetSelect(index: number, assetId: string) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    setters.setMaterials((current) => current.map((material, materialIndex) => materialIndex === index
      ? buildManualMaterialFromAsset({ role: material.role, asset, source: "manual_library", type: asset.assetType === "video" ? "video" : "image" })
      : material));
  }

  async function handleMaterialAssetUpload(index: number, file: File, assetType: "image" | "video") {
    const currentMaterial = state.materials[index];
    if (!currentMaterial) return;
    const asset = await uploadManagedAsset(file, assetType);
    setters.setMaterials((current) => current.map((material, materialIndex) => materialIndex === index
      ? buildManualMaterialFromAsset({ role: material.role, asset, source: "manual_upload", type: assetType })
      : material));
  }

  function handleBackgroundMusicSelect(assetId: string) {
    const asset = state.assets.find((item) => item.id === assetId && item.assetType === "music");
    if (!asset) return;
    setters.setBackgroundMusic({ audioUrl: asset.url, assetId: asset.id, volume: state.backgroundMusic?.volume ?? 50, source: "manual_library" });
  }

  async function handleBackgroundMusicUpload(file: File) {
    const asset = await uploadManagedAsset(file, "music");
    setters.setBackgroundMusic({ audioUrl: asset.url, assetId: asset.id, volume: state.backgroundMusic?.volume ?? 50, source: "manual_upload" });
  }

  return { handleMaterialAssetSelect, handleMaterialAssetUpload, handleBackgroundMusicSelect, handleBackgroundMusicUpload };
}
