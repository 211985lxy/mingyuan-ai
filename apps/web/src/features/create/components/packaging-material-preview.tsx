"use client";

import { useState } from "react";
import { ImageIcon, Play } from "lucide-react";
import type { MaterialAssignment } from "@/types/api";

export const MATERIAL_ROLES = [
  { value: "product_detail", label: "产品细节", aiEligible: true },
  { value: "store_environment", label: "门店环境", aiEligible: true },
  { value: "process", label: "操作过程", aiEligible: true },
  { value: "customer_case", label: "客户案例", aiEligible: false },
  { value: "qualification", label: "资质证明", aiEligible: false },
  { value: "before_after", label: "Before/After", aiEligible: false },
] as const;

export const PACKAGING_CAPABILITY_LABELS: Record<string, string> = {
  strong_title: "标题栏",
  subtitle: "字幕",
  heavy_subtitle: "强字幕",
  identity_card: "身份栏",
  evidence_insert: "证据插入",
  pip: "画中画",
  visual_first: "画面主导",
};

export function isAiMaterial(material: MaterialAssignment): boolean {
  return material.source === "ai_pexels" || material.source === "ai_pixabay";
}

export function getMaterialRoleLabel(role: string) {
  return MATERIAL_ROLES.find((item) => item.value === role)?.label ?? role;
}

export function MaterialPreview({ material }: { material: MaterialAssignment }) {
  const [imgError, setImgError] = useState(false);
  // When OSS transfer is pending, prefer the stock CDN thumbnail (always available)
  // over the signed OSS URL (won't resolve until transfer completes)
  const previewUrl = material.ossStatus === "ready"
    ? (material.previewUrl || material.thumbnailUrl || material.fileUrl)
    : (material.thumbnailUrl || material.previewUrl || material.fileUrl);

  if (!previewUrl || imgError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
        {material.type === "video" ? (
          <Play className="h-5 w-5 opacity-50" />
        ) : (
          <ImageIcon className="h-5 w-5 opacity-50" />
        )}
      </div>
    );
  }

  if (material.type === "video") {
    return (
      <video
        src={previewUrl}
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={previewUrl}
      alt={getMaterialRoleLabel(material.role)}
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => setImgError(true)}
    />
  );
}
