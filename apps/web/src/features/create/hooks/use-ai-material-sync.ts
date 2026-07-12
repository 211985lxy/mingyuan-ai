"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { getPexelsMedia } from "@/lib/api/client";
import { isAiMaterial } from "@/features/create/components/packaging-material-preview";
import type { MaterialAssignment } from "@/types/api";

export function useAiMaterialSync(
  materials: MaterialAssignment[],
  setMaterials: Dispatch<SetStateAction<MaterialAssignment[]>>,
) {
  useEffect(() => {
    const pendingMaterials = materials.filter(
      (material) => isAiMaterial(material)
        && typeof material.pexelsId === "number"
        && material.ossStatus !== "ready"
        && material.ossStatus !== "failed",
    );
    if (pendingMaterials.length === 0) return;

    let cancelled = false;
    const syncMaterials = async () => {
      const updates = await Promise.all(pendingMaterials.map(async (material) => {
        try {
          const provider = material.source === "ai_pixabay" ? "pixabay" as const : "pexels" as const;
          const latest = await getPexelsMedia(material.pexelsId!, provider);
          return {
            pexelsId: material.pexelsId!,
            ossStatus: latest.ossStatus as MaterialAssignment["ossStatus"],
            fileUrl: latest.ossStatus === "ready" ? latest.ossUrl ?? material.fileUrl : material.fileUrl,
            previewUrl: latest.ossUrl ?? latest.imageUrl ?? material.previewUrl ?? material.fileUrl,
          };
        } catch {
          return null;
        }
      }));
      if (cancelled) return;

      const updateMap = new Map(updates.filter(Boolean).map((item) => [item!.pexelsId, item!]));
      if (updateMap.size === 0) return;
      setMaterials((current) => current.map((material) => {
        if (!isAiMaterial(material) || !material.pexelsId) return material;
        const latest = updateMap.get(material.pexelsId);
        if (!latest) return material;
        return {
          ...material,
          fileUrl: latest.fileUrl,
          previewUrl: latest.previewUrl,
          thumbnailUrl: material.thumbnailUrl ?? latest.previewUrl,
          ossStatus: latest.ossStatus,
        };
      }));
    };

    void syncMaterials();
    const timer = window.setInterval(() => void syncMaterials(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [materials, setMaterials]);
}
