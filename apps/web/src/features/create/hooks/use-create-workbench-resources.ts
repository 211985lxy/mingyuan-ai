"use client";

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import {
  listAssets,
  listCopyStructures,
  listEndingTypes,
  listOpeningTypes,
  listPackagingTemplates,
  listTemplates,
  syncPackagingTemplates,
} from "@/lib/api/client";
import { mapCopyToVideoStructure } from "@/lib/copy-structure-mapping";
import type {
  ApiAsset,
  ApiCopyStructure,
  ApiEndingType,
  ApiOpeningType,
  ApiVideoPackagingTemplate,
} from "@/types/api";

type Setter<T> = Dispatch<SetStateAction<T>>;

function mergeAssets(assetGroups: ApiAsset[][]): ApiAsset[] {
  const merged = new Map<string, ApiAsset>();
  for (const group of assetGroups) {
    for (const asset of group) merged.set(asset.id, asset);
  }
  return [...merged.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function resolveWorkbenchTemplateVideoType(videoType: string | null | undefined) {
  return videoType?.trim() || "broadcast_mixcut";
}

function isWorkbenchSupportedVideoType(videoType: string | null | undefined) {
  return ["broadcast_mixcut", "custom_broadcast_mixcut"].includes(
    resolveWorkbenchTemplateVideoType(videoType),
  );
}

export interface CreateWorkbenchResourcesParams {
  currentPhase: number;
  selectedScriptId: string | null;
  selectedCopyStructureCode: string | null;
  selectedPackagingTemplateId: string | null;
  packagingTemplates: ApiVideoPackagingTemplate[];
  assetsLoading: boolean;
  openingTypes: ApiOpeningType[];
  copyStructures: ApiCopyStructure[];
  endingTypes: ApiEndingType[];
  selectedEndingCode: string | null;
  assetsLoadedRef: { current: boolean };
  setFallbackTemplateId: Setter<string | null>;
  setPackagingTemplates: Setter<ApiVideoPackagingTemplate[]>;
  setPackagingLoading: Setter<boolean>;
  setPackagingSyncing: Setter<boolean>;
  setPackagingError: Setter<string | null>;
  setSelectedPackagingTemplateId: Setter<string | null>;
  setAssets: Setter<ApiAsset[]>;
  setAssetsLoading: Setter<boolean>;
  setAssetLibraryError: Setter<string | null>;
  setOpeningTypes: Setter<ApiOpeningType[]>;
  setCopyStructures: Setter<ApiCopyStructure[]>;
  setEndingTypes: Setter<ApiEndingType[]>;
  setSelectedEndingCode: Setter<string | null>;
}

export function useCreateWorkbenchResources(params: CreateWorkbenchResourcesParams) {
  const {
    currentPhase,
    selectedScriptId,
    selectedCopyStructureCode,
    selectedPackagingTemplateId,
    packagingTemplates,
    assetsLoading,
    openingTypes,
    copyStructures,
    endingTypes,
    selectedEndingCode,
    assetsLoadedRef,
    setFallbackTemplateId,
    setPackagingTemplates,
    setPackagingLoading,
    setPackagingSyncing,
    setPackagingError,
    setSelectedPackagingTemplateId,
    setAssets,
    setAssetsLoading,
    setAssetLibraryError,
    setOpeningTypes,
    setCopyStructures,
    setEndingTypes,
    setSelectedEndingCode,
  } = params;

  const loadPackagingTemplates = useCallback(async (options?: { forceSync?: boolean }) => {
    setPackagingLoading(true);
    setPackagingError(null);
    try {
      const structureId = selectedCopyStructureCode
        ? mapCopyToVideoStructure(selectedCopyStructureCode)
        : null;
      let templates = options?.forceSync
        ? []
        : await listPackagingTemplates({ structureId, scriptId: selectedScriptId });

      if (templates.length === 0) {
        setPackagingSyncing(true);
        try {
          await syncPackagingTemplates();
          templates = await listPackagingTemplates({ structureId, scriptId: selectedScriptId });
        } finally {
          setPackagingSyncing(false);
        }
      }

      setPackagingTemplates(templates);
      if (templates.length === 0) {
        setPackagingError("已尝试自动同步包装模板，但当前仍没有可用模板，请检查闪剪模板权限或联系管理员。");
      }
      if (selectedPackagingTemplateId && !templates.some((template) => template.id === selectedPackagingTemplateId)) {
        setSelectedPackagingTemplateId(null);
      }
    } catch (error) {
      setPackagingTemplates([]);
      setPackagingError(error instanceof Error ? error.message : "包装模板加载失败，请稍后重试");
    } finally {
      setPackagingLoading(false);
      setPackagingSyncing(false);
    }
  }, [
    selectedCopyStructureCode,
    selectedPackagingTemplateId,
    selectedScriptId,
    setPackagingError,
    setPackagingLoading,
    setPackagingSyncing,
    setPackagingTemplates,
    setSelectedPackagingTemplateId,
  ]);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    setAssetLibraryError(null);
    try {
      const groups = await Promise.all([listAssets("image"), listAssets("video"), listAssets("music")]);
      setAssets(mergeAssets(groups));
    } catch (error) {
      setAssetLibraryError(error instanceof Error ? error.message : "素材库加载失败，请稍后重试");
    } finally {
      assetsLoadedRef.current = true;
      setAssetsLoading(false);
    }
  }, [assetsLoadedRef, setAssetLibraryError, setAssets, setAssetsLoading]);

  useEffect(() => {
    listTemplates()
      .then((data) => {
        const fallback = data.results.find((template) => isWorkbenchSupportedVideoType(template.videoType));
        if (fallback) setFallbackTemplateId(fallback.id);
      })
      .catch(() => {});
  }, [setFallbackTemplateId]);

  useEffect(() => {
    if (currentPhase < 1) return;
    if (openingTypes.length === 0) listOpeningTypes().then(setOpeningTypes).catch(() => {});
    if (copyStructures.length === 0) listCopyStructures().then(setCopyStructures).catch(() => {});
    if (endingTypes.length === 0) listEndingTypes().then(setEndingTypes).catch(() => {});
  }, [copyStructures.length, currentPhase, endingTypes.length, openingTypes.length, setCopyStructures, setEndingTypes, setOpeningTypes]);

  useEffect(() => {
    if (currentPhase >= 1 && !selectedEndingCode && endingTypes.length > 0) {
      setSelectedEndingCode(endingTypes[0].code);
    }
  }, [currentPhase, endingTypes, selectedEndingCode, setSelectedEndingCode]);

  useEffect(() => {
    if (currentPhase >= 2 && selectedScriptId) void loadPackagingTemplates();
  }, [currentPhase, loadPackagingTemplates, selectedScriptId]);

  useEffect(() => {
    if (currentPhase >= 2 && !assetsLoadedRef.current && !assetsLoading) void loadAssets();
  }, [assetsLoading, assetsLoadedRef, currentPhase, loadAssets]);

  useEffect(() => {
    if (currentPhase < 2 || selectedPackagingTemplateId) return;
    const template = packagingTemplates.find((item) => item.recommendation?.tier === "recommended")
      ?? packagingTemplates.find((item) => item.recommendation?.tier !== "blocked");
    if (template) setSelectedPackagingTemplateId(template.id);
  }, [currentPhase, packagingTemplates, selectedPackagingTemplateId, setSelectedPackagingTemplateId]);

  return { loadAssets, loadPackagingTemplates };
}
