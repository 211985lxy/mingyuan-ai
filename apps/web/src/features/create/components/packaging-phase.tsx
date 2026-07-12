"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Music, Package, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScriptCommandCenter } from "@/features/create/components/workbench-overview";
import { AiMaterialPanel } from "@/features/create/components/ai-material-panel";
import { ManualMaterialPanel } from "@/features/create/components/manual-material-panel";
import { isAiMaterial } from "@/features/create/components/packaging-material-preview";
import { PackagingTemplateSelector } from "@/features/create/components/packaging-template-selector";
import type {
  ApiAsset,
  ApiPackagingTemplateRecommendation,
  ApiVideoPackagingTemplate,
  BackgroundMusicSelection,
  MaterialAssignment,
} from "@/types/api";

export function PhasePackaging({
  packagingTemplates,
  loading,
  syncing,
  errorMessage,
  selectedId,
  onSelect,
  onRetrySync,
  templateDefaultPackagingName,
  canProceed,
  materials,
  onMaterialsChange,
  backgroundMusic,
  onBackgroundMusicChange,
  assets,
  assetsLoading,
  assetLibraryError,
  materialAssistLoading,
  materialAssistError,
  selectedRecommendation,
  blockingAiCount,
  incompleteManualCount,
  onRefreshAssets,
  onGenerateMaterials,
  onMaterialAssetSelect,
  onMaterialAssetUpload,
  onBackgroundMusicSelect,
  onBackgroundMusicUpload,
  editedScript,
  onNext,
  onBack,
}: {
  packagingTemplates: ApiVideoPackagingTemplate[];
  loading: boolean;
  syncing: boolean;
  errorMessage: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetrySync: () => void;
  templateDefaultPackagingName: string | null;
  canProceed: boolean;
  materials: MaterialAssignment[];
  onMaterialsChange: (m: MaterialAssignment[]) => void;
  backgroundMusic: BackgroundMusicSelection | null;
  onBackgroundMusicChange: (value: BackgroundMusicSelection | null) => void;
  assets: ApiAsset[];
  assetsLoading: boolean;
  assetLibraryError: string | null;
  materialAssistLoading: boolean;
  materialAssistError: string | null;
  selectedRecommendation: ApiPackagingTemplateRecommendation | null;
  blockingAiCount: number;
  incompleteManualCount: number;
  onRefreshAssets: () => Promise<void> | void;
  onGenerateMaterials: () => Promise<void> | void;
  onMaterialAssetSelect: (index: number, assetId: string) => void;
  onMaterialAssetUpload: (
    index: number,
    file: File,
    assetType: "image" | "video",
  ) => Promise<void>;
  onBackgroundMusicSelect: (assetId: string) => void;
  onBackgroundMusicUpload: (file: File) => Promise<void>;
  editedScript: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [assetActionError, setAssetActionError] = useState<string | null>(null);
  const [uploadingMaterialIndex, setUploadingMaterialIndex] = useState<number | null>(null);
  const [uploadingBgm, setUploadingBgm] = useState(false);
  const materialFileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});
  const backgroundMusicInputRef = useRef<HTMLInputElement | null>(null);


  const readyAssets = useMemo(
    () => assets.filter((asset) => asset.status === "ready"),
    [assets],
  );
  const imageAssets = useMemo(
    () => readyAssets.filter((asset) => asset.assetType === "image"),
    [readyAssets],
  );
  const videoAssets = useMemo(
    () => readyAssets.filter((asset) => asset.assetType === "video"),
    [readyAssets],
  );
  const musicAssets = useMemo(
    () => readyAssets.filter((asset) => asset.assetType === "music"),
    [readyAssets],
  );
  const aiEntries = useMemo(
    () =>
      materials
        .map((material, index) => ({ material, index }))
        .filter(({ material }) => isAiMaterial(material)),
    [materials],
  );
  const manualEntries = useMemo(
    () =>
      materials
        .map((material, index) => ({ material, index }))
        .filter(({ material }) => !isAiMaterial(material)),
    [materials],
  );
  const selectedBgmAsset = backgroundMusic?.assetId
    ? musicAssets.find((asset) => asset.id === backgroundMusic.assetId) ?? null
    : null;

  function addMaterial(role: string) {
    onMaterialsChange([
      ...materials,
      {
        role,
        fileUrl: "",
        type: "image",
        source: "manual_library",
        assetId: null,
        previewUrl: null,
        thumbnailUrl: null,
      },
    ]);
  }

  function updateMaterial(index: number, updates: Partial<MaterialAssignment>) {
    const updated = [...materials];
    updated[index] = { ...updated[index], ...updates };
    onMaterialsChange(updated);
  }

  function removeMaterial(index: number) {
    onMaterialsChange(materials.filter((_, i) => i !== index));
  }

  async function handleMaterialUpload(
    index: number,
    file: File,
    assetType: "image" | "video",
  ) {
    setAssetActionError(null);
    setUploadingMaterialIndex(index);
    try {
      await onMaterialAssetUpload(index, file, assetType);
    } catch (error) {
      setAssetActionError(
        error instanceof Error ? error.message : "素材上传失败，请稍后重试",
      );
    } finally {
      setUploadingMaterialIndex(null);
    }
  }

  async function handleBackgroundMusicUploadInternal(file: File) {
    setAssetActionError(null);
    setUploadingBgm(true);
    try {
      await onBackgroundMusicUpload(file);
    } catch (error) {
      setAssetActionError(
        error instanceof Error ? error.message : "背景音乐上传失败，请稍后重试",
      );
    } finally {
      setUploadingBgm(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          内容生产官 · 包装与证据
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          这一阶段不重新创作文案，只为最终文案选择合适的画面节奏、模板能力和证据素材。
        </p>
      </div>

      <ScriptCommandCenter
        stage="最终文案"
        title="文案是本阶段的主控输入"
        subtitle="包装模板、素材角色和 BGM 都会围绕这条口播去匹配。"
        script={editedScript}
        badges={["模板匹配文案节奏", "素材补足文案证据", "BGM 服务表达情绪"]}
      />

      <PackagingTemplateSelector
        packagingTemplates={packagingTemplates}
        loading={loading}
        syncing={syncing}
        errorMessage={errorMessage}
        selectedId={selectedId}
        selectedRecommendation={selectedRecommendation}
        templateDefaultPackagingName={templateDefaultPackagingName}
        onSelect={onSelect}
        onRetrySync={onRetrySync}
      />

      <AiMaterialPanel
        aiEntries={aiEntries}
        selectedRecommendation={selectedRecommendation}
        materialAssistLoading={materialAssistLoading}
        materialAssistError={materialAssistError}
        assetActionError={assetActionError}
        assetLibraryError={assetLibraryError}
        blockingAiCount={blockingAiCount}
        onGenerateMaterials={onGenerateMaterials}
        onRemoveMaterial={removeMaterial}
      />

      <ManualMaterialPanel
        aiEntries={aiEntries}
        incompleteManualCount={incompleteManualCount}
        assetsLoading={assetsLoading}
        manualEntries={manualEntries}
        imageAssets={imageAssets}
        videoAssets={videoAssets}
        uploadingMaterialIndex={uploadingMaterialIndex}
        materialFileInputsRef={materialFileInputsRef}
        onRefreshAssets={onRefreshAssets}
        onAddMaterial={addMaterial}
        onUpdateMaterial={updateMaterial}
        onRemoveMaterial={removeMaterial}
        onMaterialAssetSelect={onMaterialAssetSelect}
        onMaterialAssetUpload={handleMaterialUpload}
        onClearAssetActionError={() => setAssetActionError(null)}
      />

      {/* BGM */}
      <Separator />
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Music className="h-4 w-4 text-primary" />
              背景音乐（可选）
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              当前还没有真实 BGM 智能接口，所以这里只支持手动上传或从素材库选择。留空则沿用模板默认音乐。
            </p>
            {selectedRecommendation?.bgmGuidance && (
              <p className="mt-2 text-xs text-muted-foreground">
                建议风格：<span className="font-medium text-foreground">{selectedRecommendation.bgmGuidance}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={backgroundMusicInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void handleBackgroundMusicUploadInternal(file);
                event.currentTarget.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploadingBgm}
              onClick={() => backgroundMusicInputRef.current?.click()}
              className="cursor-pointer gap-1.5"
            >
              {uploadingBgm ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  上传中
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  上传 BGM
                </>
              )}
            </Button>
            {backgroundMusic && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onBackgroundMusicChange(null)}
                className="cursor-pointer text-muted-foreground hover:text-red-500"
              >
                清除
              </Button>
            )}
          </div>
        </div>

        <select
          value={backgroundMusic?.assetId ?? ""}
          onChange={(event) => {
            if (!event.target.value) {
              onBackgroundMusicChange(null);
              return;
            }
            setAssetActionError(null);
            onBackgroundMusicSelect(event.target.value);
          }}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="">使用模板默认音乐</option>
          {musicAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            {selectedBgmAsset?.name
              ?? (backgroundMusic ? "已选择自定义背景音乐" : "当前未覆盖模板默认 BGM")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {backgroundMusic
              ? `音量 ${backgroundMusic.volume}% · ${backgroundMusic.source === "manual_upload" ? "来自刚上传资产" : "来自素材库"}`
              : "如果你不选择，最终视频会沿用包装模板自身的背景音乐配置。"}
          </p>
        </div>
      </div>

      {/* Spacer for sticky bottom bar */}
      <div className="h-20" />

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Button type="button" variant="outline" onClick={onBack} className="cursor-pointer">
            <ChevronLeft className="h-4 w-4 mr-1" /> 上一步
          </Button>
          <Button type="button" onClick={onNext} disabled={!canProceed} className="cursor-pointer">
            下一步：出视频 <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

