"use client";

import type { MutableRefObject } from "react";
import { AlertTriangle, ImageIcon, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getMaterialRoleLabel, MATERIAL_ROLES, MaterialPreview } from "@/features/create/components/packaging-material-preview";
import type { ApiAsset, MaterialAssignment } from "@/types/api";

interface ManualMaterialPanelProps {
  aiEntries: Array<{ material: MaterialAssignment; index: number }>;
  incompleteManualCount: number;
  assetsLoading: boolean;
  manualEntries: Array<{ material: MaterialAssignment; index: number }>;
  imageAssets: ApiAsset[];
  videoAssets: ApiAsset[];
  uploadingMaterialIndex: number | null;
  materialFileInputsRef: MutableRefObject<Record<number, HTMLInputElement | null>>;
  onRefreshAssets: () => Promise<void> | void;
  onAddMaterial: (role: string) => void;
  onUpdateMaterial: (index: number, updates: Partial<MaterialAssignment>) => void;
  onRemoveMaterial: (index: number) => void;
  onMaterialAssetSelect: (index: number, assetId: string) => void;
  onMaterialAssetUpload: (index: number, file: File, assetType: "image" | "video") => Promise<void>;
  onClearAssetActionError: () => void;
}

export function ManualMaterialPanel({
  aiEntries,
  incompleteManualCount,
  assetsLoading,
  manualEntries,
  imageAssets,
  videoAssets,
  uploadingMaterialIndex,
  materialFileInputsRef,
  onRefreshAssets,
  onAddMaterial,
  onUpdateMaterial,
  onRemoveMaterial,
  onMaterialAssetSelect,
  onMaterialAssetUpload,
  onClearAssetActionError,
}: ManualMaterialPanelProps) {
  return (
    <>
      {/* Manual materials */}
      <Separator />
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              手动补充（可选）
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {aiEntries.length > 0
                ? "上方 AI 素材已自动用于视频，无需重复添加。此区域仅用于上传你自己的真实素材（客户案例、资质证明等）。"
                : "上传你自己的图片或视频素材，或从素材库选择已有资产。"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefreshAssets()}
            disabled={assetsLoading}
            className="cursor-pointer gap-1.5"
          >
            {assetsLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                刷新中
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                刷新素材库
              </>
            )}
          </Button>
        </div>

        {incompleteManualCount > 0 && (
          <Card className="border-muted">
            <CardContent className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {incompleteManualCount} 个手动素材卡片未选定资产，提交时将自动跳过。
                  {aiEntries.length > 0 && " AI 素材已就位，不影响视频生成。"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {MATERIAL_ROLES.map((role) => {
            const aiFilledCount = aiEntries.filter(({ material: m }) => m.role === role.value).length;
            return (
              <Button
                key={role.value}
                variant="outline"
                size="sm"
                onClick={() => onAddMaterial(role.value)}
                className="cursor-pointer text-xs gap-1"
              >
                + {role.label}
                {aiFilledCount > 0 && (
                  <Badge variant="default" className="ml-1 px-1.5 py-0 text-[10px] bg-primary/10 text-primary">
                    AI 已补 {aiFilledCount}
                  </Badge>
                )}
                {!role.aiEligible && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                    仅手动
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        {manualEntries.length > 0 ? (
          <div className="space-y-3">
            {manualEntries.map(({ material, index }) => {
              const selectableAssets = material.type === "video" ? videoAssets : imageAssets;
              return (
                <Card key={`manual-${index}`}>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-3">
                        <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                          <MaterialPreview material={material} />
                        </div>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {getMaterialRoleLabel(material.role)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {material.source === "manual_upload" ? "刚上传" : "素材库"}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={material.type}
                              onChange={(event) =>
                                onUpdateMaterial(index, {
                                  type: event.target.value as "image" | "video",
                                  assetId: null,
                                  fileUrl: "",
                                  previewUrl: null,
                                  thumbnailUrl: null,
                                  source: "manual_library",
                                })
                              }
                              className="h-8 rounded-md border bg-background px-2 text-sm"
                            >
                              <option value="image">图片素材</option>
                              <option value="video">视频素材</option>
                            </select>
                            <select
                              value={material.assetId ?? ""}
                              onChange={(event) => {
                                onClearAssetActionError();
                                if (!event.target.value) {
                                  onUpdateMaterial(index, {
                                    assetId: null,
                                    fileUrl: "",
                                    previewUrl: null,
                                    thumbnailUrl: null,
                                    source: "manual_library",
                                  });
                                  return;
                                }
                                onMaterialAssetSelect(index, event.target.value);
                              }}
                              className="h-8 w-full sm:min-w-[220px] rounded-md border bg-background px-2 text-sm"
                            >
                              <option value="">从素材库选择一个{material.type === "video" ? "视频" : "图片"}</option>
                              {selectableAssets.map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                  {asset.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {selectableAssets.length > 0
                              ? `素材库中可选 ${selectableAssets.length} 个${material.type === "video" ? "视频" : "图片"}资产。`
                              : `素材库里还没有可用${material.type === "video" ? "视频" : "图片"}资产，请直接上传。`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <input
                          ref={(node) => {
                            materialFileInputsRef.current[index] = node;
                          }}
                          type="file"
                          accept={material.type === "video" ? "video/*" : "image/*"}
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            void onMaterialAssetUpload(index, file, material.type);
                            event.currentTarget.value = "";
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={uploadingMaterialIndex === index}
                          onClick={() => materialFileInputsRef.current[index]?.click()}
                          className="cursor-pointer gap-1.5"
                        >
                          {uploadingMaterialIndex === index ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              上传中
                            </>
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5" />
                              上传新素材
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveMaterial(index)}
                          className="cursor-pointer text-muted-foreground hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="text-sm text-muted-foreground">
              还没有手动素材。需要真实证明、案例或品牌自有画面时，先点上面的角色按钮再选择或上传。
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
