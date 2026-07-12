"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, Loader2, Package, Play, Search, Wand2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getMaterialRoleLabel,
  PACKAGING_CAPABILITY_LABELS,
} from "@/features/create/components/packaging-material-preview";
import type { ApiPackagingTemplateRecommendation, ApiVideoPackagingTemplate } from "@/types/api";

const RECOMMENDATION_TIER_LABELS: Record<NonNullable<ApiPackagingTemplateRecommendation["tier"]>, string> = {
  recommended: "推荐",
  acceptable: "可用",
  weak_fit: "弱匹配",
  blocked: "不可用",
};

const RECOMMENDATION_TIER_CLASSES: Record<NonNullable<ApiPackagingTemplateRecommendation["tier"]>, string> = {
  recommended: "border-emerald-300 text-emerald-700 bg-emerald-50",
  acceptable: "border-sky-300 text-sky-700 bg-sky-50",
  weak_fit: "border-amber-300 text-amber-700 bg-amber-50",
  blocked: "border-red-300 text-red-700 bg-red-50",
};

interface PackagingTemplateSelectorProps {
  packagingTemplates: ApiVideoPackagingTemplate[];
  loading: boolean;
  syncing: boolean;
  errorMessage: string | null;
  selectedId: string | null;
  selectedRecommendation: ApiPackagingTemplateRecommendation | null;
  templateDefaultPackagingName: string | null;
  onSelect: (id: string) => void;
  onRetrySync: () => void;
}

export function PackagingTemplateSelector({
  packagingTemplates,
  loading,
  syncing,
  errorMessage,
  selectedId,
  selectedRecommendation,
  templateDefaultPackagingName,
  onSelect,
  onRetrySync,
}: PackagingTemplateSelectorProps) {
  const [templateSearch, setTemplateSearch] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<ApiVideoPackagingTemplate | null>(null);
  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return packagingTemplates;
    const query = templateSearch.trim().toLowerCase();
    return packagingTemplates.filter((template) => template.name.toLowerCase().includes(query));
  }, [packagingTemplates, templateSearch]);
  const recommendedTemplate = useMemo(
    () => packagingTemplates.find((template) => template.recommendation?.tier === "recommended") ?? null,
    [packagingTemplates],
  );

  return (
    <>
      {/* Packaging templates */}
      <div className="space-y-3">
        {recommendedTemplate?.recommendation && (
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-emerald-300 bg-emerald-100 text-emerald-700">
                  系统首推
                </Badge>
                <p className="text-sm font-medium">{recommendedTemplate.name}</p>
                <span className="text-xs text-muted-foreground">
                  适配分 {recommendedTemplate.recommendation.score}
                </span>
              </div>
              {recommendedTemplate.recommendation.reasons.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {recommendedTemplate.recommendation.reasons.join("；")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {templateDefaultPackagingName && (
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent>
              <p className="text-sm">
                当前表达模板已绑定默认包装：
                <span className="font-medium ml-1">{templateDefaultPackagingName}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                你可以直接沿用这套包装，也可以在下方手动覆盖成其他包装模板。
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">按文案选择包装模板</h3>
          {!loading && packagingTemplates.length > 0 && (
            <span className="text-xs text-muted-foreground">{filteredTemplates.length} / {packagingTemplates.length} 个模板</span>
          )}
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[9/16] w-full rounded-lg" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : packagingTemplates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="text-center text-sm text-muted-foreground">
              <p>{syncing ? "正在同步真实包装模板，请稍候…" : "暂无可用包装模板，当前无法完成视频包装"}</p>
              <p className="text-xs mt-1">
                {errorMessage ?? "系统会尝试从闪剪同步包装模板；如果仍为空，请点击下方按钮重试。"}
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetrySync}
                  disabled={loading || syncing}
                  className="cursor-pointer gap-2"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在同步模板
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      立即同步并重试
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Search bar */}
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索模板名称..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            {/* Scrollable template grid */}
            <div className="max-h-[520px] overflow-y-auto rounded-lg border bg-muted/20 p-3">
              {filteredTemplates.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {filteredTemplates.map((tmpl) => {
                    const isSelected = selectedId === tmpl.id;
                    const recommendation = tmpl.recommendation;
                    const isBlocked = recommendation?.tier === "blocked";
                    return (
                      <div
                        key={tmpl.id}
                        className={`group relative rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                          isBlocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-md"
                        } ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/20 shadow-md"
                            : isBlocked
                              ? "border-red-200"
                              : "border-transparent hover:border-primary/30"
                        }`}
                        onClick={() => {
                          if (!isBlocked) {
                            onSelect(tmpl.id);
                          }
                        }}
                      >
                        <div className="relative aspect-[9/16] bg-muted">
                          {tmpl.coverUrl ? (
                            <Image
                              src={tmpl.coverUrl}
                              alt={tmpl.name}
                              fill
                              unoptimized
                              sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 16vw"
                              className="object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Package className="h-6 w-6 text-muted-foreground/30" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                          {tmpl.demoUrl && (
                            <button
                              type="button"
                              className="absolute bottom-1 right-1 bg-black/60 text-white rounded-full p-1.5 cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all"
                              onClick={(e) => { e.stopPropagation(); setPreviewTemplate(tmpl); }}
                            >
                              <Play className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <div className="p-1.5 bg-background">
                          <p className="text-xs font-medium truncate">{tmpl.name}</p>
                          {recommendation && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={`px-1.5 py-0 text-[10px] ${RECOMMENDATION_TIER_CLASSES[recommendation.tier]}`}
                              >
                                {RECOMMENDATION_TIER_LABELS[recommendation.tier]}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {recommendation.score}
                              </span>
                            </div>
                          )}
                          {tmpl.capabilities.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {tmpl.capabilities.slice(0, 2).map((capability) => (
                                <Badge key={capability} variant="outline" className="px-1.5 py-0 text-[10px]">
                                  {PACKAGING_CAPABILITY_LABELS[capability] ?? capability}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {recommendation?.reasons?.[0] && (
                            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                              {recommendation.reasons[0]}
                            </p>
                          )}
                          {recommendation?.blockingReasons?.[0] && (
                            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-red-600">
                              {recommendation.blockingReasons[0]}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Search className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">没有找到匹配的模板</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedRecommendation && (
        <Card className="border-primary/15 bg-primary/[0.03]">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={RECOMMENDATION_TIER_CLASSES[selectedRecommendation.tier]}
              >
                当前模板：{RECOMMENDATION_TIER_LABELS[selectedRecommendation.tier]}
              </Badge>
              <span className="text-sm font-medium">
                适配分 {selectedRecommendation.score}
              </span>
            </div>
            {selectedRecommendation.reasons.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">为什么推荐</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {selectedRecommendation.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {selectedRecommendation.recommendedMaterialRoles?.length ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">建议补的素材角色</p>
                <div className="flex flex-wrap gap-2">
                  {selectedRecommendation.recommendedMaterialRoles.map((role) => (
                    <Badge key={role} variant="secondary" className="text-xs">
                      {getMaterialRoleLabel(role)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Template demo video preview dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => { if (!open) setPreviewTemplate(null); }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogTitle className="sr-only">模板预览</DialogTitle>
          {previewTemplate && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div>
                  <p className="text-sm font-semibold">{previewTemplate.name}</p>
                  <p className="text-xs text-muted-foreground">模板效果预览</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer h-7 w-7 p-0"
                  onClick={() => setPreviewTemplate(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative bg-black aspect-[9/16] max-h-[70vh]">
                <video
                  src={previewTemplate.demoUrl ?? undefined}
                  autoPlay
                  controls
                  playsInline
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
              <div className="px-4 py-3 border-t flex justify-end">
                <Button
                  size="sm"
                  disabled={previewTemplate.recommendation?.tier === "blocked"}
                  className="cursor-pointer gap-1.5"
                  onClick={() => {
                    onSelect(previewTemplate.id);
                    setPreviewTemplate(null);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  选择此模板
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
