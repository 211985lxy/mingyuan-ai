"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { getMaterialRoleLabel, MaterialPreview } from "@/features/create/components/packaging-material-preview";
import type { ApiPackagingTemplateRecommendation, MaterialAssignment } from "@/types/api";

interface AiMaterialPanelProps {
  aiEntries: Array<{ material: MaterialAssignment; index: number }>;
  selectedRecommendation: ApiPackagingTemplateRecommendation | null;
  materialAssistLoading: boolean;
  materialAssistError: string | null;
  assetActionError: string | null;
  assetLibraryError: string | null;
  blockingAiCount: number;
  onGenerateMaterials: () => Promise<void> | void;
  onRemoveMaterial: (index: number) => void;
}

export function AiMaterialPanel({
  aiEntries,
  selectedRecommendation,
  materialAssistLoading,
  materialAssistError,
  assetActionError,
  assetLibraryError,
  blockingAiCount,
  onGenerateMaterials,
  onRemoveMaterial,
}: AiMaterialPanelProps) {
  const [previewAiMaterial, setPreviewAiMaterial] = useState<{ material: MaterialAssignment; index: number } | null>(null);

  return (
    <>
      {/* AI material preview dialog */}
      <Dialog open={!!previewAiMaterial} onOpenChange={(open) => { if (!open) setPreviewAiMaterial(null); }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <DialogTitle className="sr-only">素材预览</DialogTitle>
          {previewAiMaterial && (
            <div className="flex flex-col">
              <div className="relative aspect-video bg-muted">
                {previewAiMaterial.material.type === "video" ? (
                  <video
                    src={previewAiMaterial.material.ossStatus === "ready"
                      ? (previewAiMaterial.material.previewUrl || previewAiMaterial.material.fileUrl)
                      : (previewAiMaterial.material.thumbnailUrl || previewAiMaterial.material.previewUrl || previewAiMaterial.material.fileUrl)}
                    controls
                    muted
                    playsInline
                    className="h-full w-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewAiMaterial.material.ossStatus === "ready"
                      ? (previewAiMaterial.material.previewUrl || previewAiMaterial.material.fileUrl)
                      : (previewAiMaterial.material.thumbnailUrl || previewAiMaterial.material.previewUrl || previewAiMaterial.material.fileUrl)}
                    alt={getMaterialRoleLabel(previewAiMaterial.material.role)}
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{getMaterialRoleLabel(previewAiMaterial.material.role)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {previewAiMaterial.material.searchQuery}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {previewAiMaterial.material.ossStatus === "ready" ? (
                      <span className="text-green-600">已就绪</span>
                    ) : previewAiMaterial.material.ossStatus === "failed" ? (
                      <span className="text-red-600">转存失败</span>
                    ) : (
                      <span className="text-amber-600">准备中...</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="cursor-pointer gap-1.5"
                    onClick={() => {
                      onRemoveMaterial(previewAiMaterial.index);
                      setPreviewAiMaterial(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    移除
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer gap-1.5"
                    onClick={() => setPreviewAiMaterial(null)}
                  >
                    关闭
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI materials */}
      <Separator />
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 一键补素材
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              AI 只会补充产品细节、门店环境、操作过程这类支持型画面；客户案例、资质证明、Before/After 必须使用你自己的真实素材。
            </p>
            {selectedRecommendation?.recommendedMaterialRoles?.length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                当前结构更建议先补：
                <span className="font-medium text-foreground">
                  {" "}
                  {selectedRecommendation.recommendedMaterialRoles
                    .map((role) => getMaterialRoleLabel(role))
                    .join(" / ")}
                </span>
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={materialAssistLoading}
            onClick={() => void onGenerateMaterials()}
            className="cursor-pointer gap-1.5"
          >
            {materialAssistLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在补充
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {aiEntries.length > 0 ? "重新生成 AI 素材" : "AI 一键补素材"}
              </>
            )}
          </Button>
        </div>

        {materialAssistError && (
          <Card className="border-red-300 bg-red-50">
            <CardContent>
              <p className="text-sm text-red-700">{materialAssistError}</p>
            </CardContent>
          </Card>
        )}

        {assetActionError && (
          <Card className="border-red-300 bg-red-50">
            <CardContent>
              <p className="text-sm text-red-700">{assetActionError}</p>
            </CardContent>
          </Card>
        )}

        {assetLibraryError && (
          <Card className="border-red-300 bg-red-50">
            <CardContent>
              <p className="text-sm text-red-700">{assetLibraryError}</p>
            </CardContent>
          </Card>
        )}

        {blockingAiCount > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  有 {blockingAiCount} 个 AI 素材正在准备中。
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  你可以继续往下确认生产总览，素材准备好后即可提交。
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {aiEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {aiEntries.map(({ material, index }) => (
              <div
                key={`ai-${index}`}
                className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-primary/20 bg-muted cursor-pointer transition-all hover:ring-2 hover:ring-primary/40"
                onClick={() => setPreviewAiMaterial({ material, index })}
              >
                <MaterialPreview material={material} />
                {material.ossStatus !== "ready" && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5 text-center text-[10px] text-white">
                    {material.ossStatus === "failed" ? "失败" : "准备中"}
                  </div>
                )}
                <div className="absolute inset-x-0 top-0 bg-black/40 px-1 py-0.5 text-center text-[10px] text-white truncate">
                  {getMaterialRoleLabel(material.role)}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemoveMaterial(index); }}
                  className="absolute top-0 right-0 hidden h-4 w-4 items-center justify-center rounded-bl-md bg-black/60 text-white group-hover:flex cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="text-sm text-muted-foreground">
              还没有 AI 补充素材。确认包装模板后，可以让系统自动补一组安全的支持型画面。
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
