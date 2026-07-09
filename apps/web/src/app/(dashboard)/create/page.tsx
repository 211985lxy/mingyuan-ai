"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Sparkles,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Clapperboard,
  PenLine,
  Package,
  Play,
  Music,
  ImageIcon,
  AlertTriangle,
  Eye,
  FileText,
  Wand2,
  Search,
  X,
  Upload,
  RefreshCw,
  Clock,
  Flame,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  listTemplates,
  generateScripts as apiGenerateScripts,
  updateScript,
  listPackagingTemplates,
  syncPackagingTemplates,
  createProductionPlan,
  createVideoTask,
  getVideoTask,
  listAssets,
  uploadFileToStorage,
  registerAsset,
  generatePackagingMaterialSuggestions,
  getPexelsMedia,
  generateTopics,
  selectTopic,
  listOpeningTypes,
  listCopyStructures,
  listEndingTypes,
  checkScriptQuality,
} from "@/lib/api/client";
import { buildPackagingRecommendationContext } from "@/lib/video-template-config";
import { mapCopyToVideoStructure } from "@/lib/copy-structure-mapping";
import type {
  ApiAsset,
  ApiPackagingTemplateRecommendation,
  ApiVideoPackagingTemplate,
  ApiScript,
  BackgroundMusicSelection,
  MaterialAssignment,
  ApiTopicCard,
  ApiOpeningType,
  ApiCopyStructure,
  ApiEndingType,
  IpProfileResponse,
} from "@/types/api";
import type { QualityCheckReport } from "@/lib/api/client";
import { QualityReportCard } from "@/components/quality-report";
import { polishScript } from "@/lib/api/client";
import {
  getBlockingAiMaterials,
  splitMaterialAssignments,
} from "@/lib/packaging-materials";
import { toast } from "sonner";

// ─── Phase Definitions ──────────────────────────────────

const PHASES = [
  { label: "选题", icon: Sparkles, layer: "输入" },
  { label: "定文案", icon: PenLine, layer: "主控" },
  { label: "定包装", icon: Package, layer: "证据" },
  { label: "出视频", icon: Play, layer: "演绎" },
] as const;

const PRODUCT_FLOW_STEPS = [
  "填写基础信息问卷",
  "AI 建立三维 IP 档案",
  "生成 4 个爆款选题",
  "自动生成口播文案",
  "审核文案与热点融合",
] as const;

const RECOMMENDATION_TIER_LABELS: Record<
  NonNullable<ApiPackagingTemplateRecommendation["tier"]>,
  string
> = {
  recommended: "推荐",
  acceptable: "可用",
  weak_fit: "弱匹配",
  blocked: "不可用",
};

const RECOMMENDATION_TIER_CLASSES: Record<
  NonNullable<ApiPackagingTemplateRecommendation["tier"]>,
  string
> = {
  recommended: "border-emerald-300 text-emerald-700 bg-emerald-50",
  acceptable: "border-sky-300 text-sky-700 bg-sky-50",
  weak_fit: "border-amber-300 text-amber-700 bg-amber-50",
  blocked: "border-red-300 text-red-700 bg-red-50",
};

function mergeAssets(assetGroups: ApiAsset[][]): ApiAsset[] {
  const merged = new Map<string, ApiAsset>();
  for (const group of assetGroups) {
    for (const asset of group) {
      merged.set(asset.id, asset);
    }
  }

  return [...merged.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function isAiMaterial(material: MaterialAssignment): boolean {
  return material.source === "ai_pexels" || material.source === "ai_pixabay";
}

function isIncompleteManualMaterial(material: MaterialAssignment) {
  return !isAiMaterial(material) && !material.assetId;
}

function buildManualMaterialFromAsset(input: {
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

const WORKBENCH_SUPPORTED_VIDEO_TYPES = [
  "broadcast_mixcut",
  "custom_broadcast_mixcut",
] as const;

function resolveWorkbenchTemplateVideoType(videoType: string | null | undefined) {
  const normalized = videoType?.trim();
  return normalized || "broadcast_mixcut";
}

function isWorkbenchSupportedVideoType(videoType: string | null | undefined) {
  return WORKBENCH_SUPPORTED_VIDEO_TYPES.includes(
    resolveWorkbenchTemplateVideoType(videoType) as (typeof WORKBENCH_SUPPORTED_VIDEO_TYPES)[number],
  );
}

// ─── Types ──────────────────────────────────────────────

interface WorkbenchDraft {
  currentPhase: number;
  topicSelectionId: string | null;
  selectedTopicIndex: number | null;
  openingTypeCode: string | null;
  copyStructureCode: string | null;
  endingTypeCode: string | null;
  selectedScriptId: string | null;
  editedScript: string;
  packagingTemplateId: string | null;
  materials: MaterialAssignment[];
  backgroundMusic: BackgroundMusicSelection | null;
  savedAt: number;
}

const DRAFT_KEY = "mingyuan:create-draft-v6";
const LEGACY_DRAFT_KEYS = ["mingyuan:create-draft-v5", "mingyuan:create-draft-v4"];

// ─── Main Page Component ────────────────────────────────

export default function CreateVideoPage() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [draftHydrated, setDraftHydrated] = useState(false);

  // Phase state
  const [currentPhase, setCurrentPhase] = useState(0);

  // Hot topic from URL (from home page "追热点" button)
  const [hotTopicId, setHotTopicId] = useState<string | null>(null);
  const [hotTopicTitle, setHotTopicTitle] = useState<string | null>(null);

  // Phase 0: Topic Selection
  const [topicCards, setTopicCards] = useState<ApiTopicCard[]>([]);
  const [topicSelectionId, setTopicSelectionId] = useState<string | null>(null);
  const [selectedTopicIndex, setSelectedTopicIndex] = useState<number | null>(null);
  const [selectedTopicCard, setSelectedTopicCard] = useState<ApiTopicCard | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicRefreshCount, setTopicRefreshCount] = useState(0);

  // Phase 1: Copywriting
  const [openingTypes, setOpeningTypes] = useState<ApiOpeningType[]>([]);
  const [copyStructures, setCopyStructures] = useState<ApiCopyStructure[]>([]);
  const [endingTypes, setEndingTypes] = useState<ApiEndingType[]>([]);
  const [selectedOpeningCode, setSelectedOpeningCode] = useState<string | null>(null);
  const [selectedCopyStructureCode, setSelectedCopyStructureCode] = useState<string | null>(null);
  const [selectedEndingCode, setSelectedEndingCode] = useState<string | null>(null);
  const [fallbackTemplateId, setFallbackTemplateId] = useState<string | null>(null);
  const [generatedScripts, setGeneratedScripts] = useState<ApiScript[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);

  // Phase 2: Packaging
  const [packagingTemplates, setPackagingTemplates] = useState<ApiVideoPackagingTemplate[]>([]);
  const [packagingLoading, setPackagingLoading] = useState(false);
  const [packagingSyncing, setPackagingSyncing] = useState(false);
  const [packagingError, setPackagingError] = useState<string | null>(null);
  const [selectedPackagingTemplateId, setSelectedPackagingTemplateId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialAssignment[]>([]);
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundMusicSelection | null>(null);
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetLibraryError, setAssetLibraryError] = useState<string | null>(null);
  const assetsLoadedRef = useRef(false);
  const [materialAssistLoading, setMaterialAssistLoading] = useState(false);
  const [materialAssistError, setMaterialAssistError] = useState<string | null>(null);

  // Submission & polling
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dependency invalidation tracking
  const [staleWarning, setStaleWarning] = useState<string | null>(null);

  // ─── Derived values ────────────────────────────────────

  const selectedPackaging = packagingTemplates.find((p) => p.id === selectedPackagingTemplateId) ?? null;
  const resolvedPackaging = selectedPackaging;
  const resolvedPackagingRecommendation = resolvedPackaging?.recommendation ?? null;
  const resolvedPackagingLabel = resolvedPackaging?.name ?? "未选择";
  const ipProfileReady = true;
  const hasThreeDPositioning = true;
  const blockingAiMaterials = useMemo(
    () => getBlockingAiMaterials(materials),
    [materials],
  );
  const incompleteManualMaterials = useMemo(
    () => materials.filter(isIncompleteManualMaterial),
    [materials],
  );

  // Readiness checks
  const phase0Ready = !!selectedTopicCard && !!topicSelectionId;
  const phase1Ready = !!selectedScriptId && !!editedScript.trim();
  const phase2Ready =
    !!resolvedPackaging
    && resolvedPackagingRecommendation?.tier !== "blocked";
  const phase3Ready = phase2Ready && !!editedScript.trim();

  // ─── Draft save/restore ────────────────────────────────

  const saveDraft = useCallback((overrides: Partial<WorkbenchDraft> = {}) => {
    const draft: WorkbenchDraft = {
      currentPhase,
      topicSelectionId,
      selectedTopicIndex,
      openingTypeCode: selectedOpeningCode,
      copyStructureCode: selectedCopyStructureCode,
      endingTypeCode: selectedEndingCode,
      selectedScriptId,
      editedScript,
      packagingTemplateId: selectedPackagingTemplateId,
      materials,
      backgroundMusic,
      ...overrides,
      savedAt: Date.now(),
    };

    const hasMeaningfulState =
      draft.currentPhase > 0
      || !!draft.topicSelectionId
      || !!draft.selectedScriptId
      || draft.editedScript.trim().length > 0
      || !!draft.packagingTemplateId
      || draft.materials.length > 0
      || !!draft.backgroundMusic;

    if (!hasMeaningfulState) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }

    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [
    currentPhase,
    topicSelectionId,
    selectedTopicIndex,
    selectedOpeningCode,
    selectedCopyStructureCode,
    selectedEndingCode,
    selectedScriptId,
    editedScript,
    selectedPackagingTemplateId,
    materials,
    backgroundMusic,
  ]);

  // Restore draft on mount
  useEffect(() => {
    try {
      for (const key of LEGACY_DRAFT_KEYS) {
        localStorage.removeItem(key);
      }

      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft: WorkbenchDraft = JSON.parse(raw);
        if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
          localStorage.removeItem(DRAFT_KEY);
        } else {
          if (draft.topicSelectionId) setTopicSelectionId(draft.topicSelectionId);
          if (draft.selectedTopicIndex != null) setSelectedTopicIndex(draft.selectedTopicIndex);
          if (draft.openingTypeCode) setSelectedOpeningCode(draft.openingTypeCode);
          if (draft.copyStructureCode) setSelectedCopyStructureCode(draft.copyStructureCode);
          if (draft.endingTypeCode) setSelectedEndingCode(draft.endingTypeCode);
          if (draft.selectedScriptId) setSelectedScriptId(draft.selectedScriptId);
          if (draft.editedScript) setEditedScript(draft.editedScript);
          if (draft.packagingTemplateId) setSelectedPackagingTemplateId(draft.packagingTemplateId);
          if (Array.isArray(draft.materials)) setMaterials(draft.materials);
          if (draft.backgroundMusic) setBackgroundMusic(draft.backgroundMusic);
          if (typeof draft.currentPhase === "number") {
            setCurrentPhase(Math.max(0, Math.min(draft.currentPhase, 3)));
          }
        }
      }
    } catch { /* ignore */ }
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    saveDraft();
  }, [draftHydrated, saveDraft]);

  // Read hot topic from URL params (from home page "追热点")
  useEffect(() => {
    const urlHotTopicId = searchParams.get("hotTopicId");
    const urlHotTopic = searchParams.get("hotTopic");
    if (urlHotTopicId) setHotTopicId(urlHotTopicId);
    if (urlHotTopic) setHotTopicTitle(decodeURIComponent(urlHotTopic));
  }, [searchParams]);

  // ─── Data Loading Effects ──────────────────────────────

  const loadPackagingTemplates = useCallback(async (options?: { forceSync?: boolean }) => {
    setPackagingLoading(true);
    setPackagingError(null);

    try {
      const mappedStructureId = selectedCopyStructureCode
        ? mapCopyToVideoStructure(selectedCopyStructureCode)
        : null;

      let nextTemplates = options?.forceSync
        ? []
        : await listPackagingTemplates({
            structureId: mappedStructureId,
            scriptId: selectedScriptId,
          });

      if (nextTemplates.length === 0) {
        setPackagingSyncing(true);
        try {
          await syncPackagingTemplates();
          nextTemplates = await listPackagingTemplates({
            structureId: mappedStructureId,
            scriptId: selectedScriptId,
          });
        } finally {
          setPackagingSyncing(false);
        }
      }

      setPackagingTemplates(nextTemplates);

      if (nextTemplates.length === 0) {
        setPackagingError("已尝试自动同步包装模板，但当前仍没有可用模板，请检查闪剪模板权限或联系管理员。");
      }

      if (
        selectedPackagingTemplateId
        && !nextTemplates.some((template) => template.id === selectedPackagingTemplateId)
      ) {
        setSelectedPackagingTemplateId(null);
      }
    } catch (error) {
      setPackagingTemplates([]);
      setPackagingError(
        error instanceof Error
          ? error.message
          : "包装模板加载失败，请稍后重试"
      );
    } finally {
      setPackagingLoading(false);
      setPackagingSyncing(false);
    }
  }, [selectedPackagingTemplateId, selectedScriptId, selectedCopyStructureCode]);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    setAssetLibraryError(null);
    try {
      const [imageAssets, videoAssets, musicAssets] = await Promise.all([
        listAssets("image"),
        listAssets("video"),
        listAssets("music"),
      ]);
      setAssets(mergeAssets([imageAssets, videoAssets, musicAssets]));
    } catch (error) {
      setAssetLibraryError(
        error instanceof Error ? error.message : "素材库加载失败，请稍后重试",
      );
    } finally {
      assetsLoadedRef.current = true;
      setAssetsLoading(false);
    }
  }, []);

  // Load fallback template ID on mount (first published template)
  useEffect(() => {
    listTemplates()
      .then((data) => {
        const first = data.results.find((t) =>
          isWorkbenchSupportedVideoType(resolveWorkbenchTemplateVideoType(t.videoType)),
        );
        if (first) setFallbackTemplateId(first.id);
      })
      .catch(() => {});
  }, []);

  // Load opening types, copy structures, ending types when entering phase 1
  useEffect(() => {
    if (currentPhase >= 1 && openingTypes.length === 0) {
      listOpeningTypes().then(setOpeningTypes).catch(() => {});
    }
    if (currentPhase >= 1 && copyStructures.length === 0) {
      listCopyStructures().then(setCopyStructures).catch(() => {});
    }
    if (currentPhase >= 1 && endingTypes.length === 0) {
      listEndingTypes().then(setEndingTypes).catch(() => {});
    }
  }, [currentPhase, openingTypes.length, copyStructures.length, endingTypes.length]);

  useEffect(() => {
    if (currentPhase >= 1 && !selectedEndingCode && endingTypes.length > 0) {
      setSelectedEndingCode(endingTypes[0].code);
    }
  }, [currentPhase, endingTypes, selectedEndingCode]);

  // Load packaging templates when entering phase 2
  useEffect(() => {
    if (currentPhase >= 2 && selectedScriptId) {
      void loadPackagingTemplates();
    }
  }, [currentPhase, loadPackagingTemplates, selectedScriptId]);

  useEffect(() => {
    if (currentPhase >= 2 && !assetsLoadedRef.current && !assetsLoading) {
      void loadAssets();
    }
  }, [assetsLoading, currentPhase, loadAssets]);

  useEffect(() => {
    if (currentPhase < 2) {
      return;
    }

    if (selectedPackagingTemplateId) {
      return;
    }

    const recommendedTemplate =
      packagingTemplates.find((template) => template.recommendation?.tier === "recommended")
      ?? packagingTemplates.find((template) => template.recommendation?.tier !== "blocked")
      ?? null;

    if (recommendedTemplate) {
      setSelectedPackagingTemplateId(recommendedTemplate.id);
    }
  }, [
    currentPhase,
    packagingTemplates,
    selectedPackagingTemplateId,
  ]);

  useEffect(() => {
    const pendingAi = materials.filter(
      (material) =>
        isAiMaterial(material)
        && typeof material.pexelsId === "number"
        && material.ossStatus !== "ready"
        && material.ossStatus !== "failed",
    );

    if (pendingAi.length === 0) {
      return;
    }

    let cancelled = false;

    const syncAiMaterials = async () => {
      const updates = await Promise.all(
        pendingAi.map(async (material) => {
          try {
            const provider = material.source === "ai_pixabay" ? "pixabay" as const : "pexels" as const;
            const latest = await getPexelsMedia(material.pexelsId!, provider);
            return {
              pexelsId: material.pexelsId!,
              ossStatus: latest.ossStatus as MaterialAssignment["ossStatus"],
              fileUrl: latest.ossStatus === "ready"
                ? latest.ossUrl ?? material.fileUrl
                : material.fileUrl,
              previewUrl: latest.ossUrl ?? latest.imageUrl ?? material.previewUrl ?? material.fileUrl,
            };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const updateMap = new Map(
        updates
          .filter(Boolean)
          .map((item) => [item!.pexelsId, item!]),
      );

      if (updateMap.size === 0) {
        return;
      }

      setMaterials((current) =>
        current.map((material) => {
          if ((material.source !== "ai_pexels" && material.source !== "ai_pixabay") || !material.pexelsId) {
            return material;
          }

          const latest = updateMap.get(material.pexelsId);
          if (!latest) {
            return material;
          }

          return {
            ...material,
            fileUrl: latest.fileUrl,
            previewUrl: latest.previewUrl,
            thumbnailUrl: material.thumbnailUrl ?? latest.previewUrl,
            ossStatus: latest.ossStatus,
          };
        }),
      );
    };

    void syncAiMaterials();
    const timer = window.setInterval(() => {
      void syncAiMaterials();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [materials]);

  // Poll for task status (queued at 10s, active at 3s)
  useEffect(() => {
    if (!taskId || taskStatus === "completed" || taskStatus === "failed") return;
    const interval = taskStatus === "queued" ? 10000 : 3000;
    pollRef.current = setInterval(async () => {
      try {
        const task = await getVideoTask(taskId);
        setTaskStatus(task.status);
        if (task.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          router.push(`/videos/${task.id}`);
        }
        if (task.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setTaskError(task.errorMessage ?? "生成失败，请重试");
        }
      } catch { /* continue polling */ }
    }, interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [taskId, taskStatus, router]);

  // ─── Dependency Invalidation ──────────────────────────

  function clearAiPackagingMaterials() {
    setMaterials((current) => splitMaterialAssignments(current).manual);
    setMaterialAssistError(null);
  }

  function handleCopywritingOptionChange() {
    if (generatedScripts.length > 0 || selectedScriptId) {
      setStaleWarning("你更换了文案选项，之前生成的文案需要重新生成。");
      setGeneratedScripts([]);
      setSelectedScriptId(null);
      setEditedScript("");
      setSelectedPackagingTemplateId(null);
      clearAiPackagingMaterials();
    }
  }

  function handleScriptChange(scriptId: string) {
    const script = generatedScripts.find((s) => s.id === scriptId);
    if (!script) return;
    setSelectedScriptId(scriptId);
    setEditedScript(script.content);
    if (selectedPackagingTemplateId || materials.some((item) => isAiMaterial(item))) {
      setStaleWarning("你选择了不同的文案，原来的包装方案已失效，请重新确认包装模板。");
      setSelectedPackagingTemplateId(null);
      clearAiPackagingMaterials();
    }
  }

  function handleEditedScriptChange(nextValue: string) {
    setEditedScript(nextValue);
    if (
      nextValue.trim() !== editedScript.trim()
      && (selectedPackagingTemplateId || materials.some((item) => isAiMaterial(item)))
    ) {
      setStaleWarning("你修改了文案内容，原来的包装方案已失效，请重新确认包装模板。");
      setSelectedPackagingTemplateId(null);
      clearAiPackagingMaterials();
    }
  }

  function handlePackagingTemplateChange(id: string) {
    const targetTemplate = packagingTemplates.find((template) => template.id === id) ?? null;
    if (targetTemplate?.recommendation?.tier === "blocked") {
      setStaleWarning(
        targetTemplate.recommendation.blockingReasons?.[0]
          ?? "当前模板与这条视频的表达要求存在真实能力冲突，请改选其他模板。",
      );
      return;
    }

    if (
      selectedPackagingTemplateId
      && selectedPackagingTemplateId !== id
      && materials.some((item) => isAiMaterial(item))
    ) {
      setStaleWarning("你更换了包装模板，现有 AI 补充素材已清空，请重新生成或改用手动素材。");
      clearAiPackagingMaterials();
    }
    setSelectedPackagingTemplateId(id);
  }

  // ─── Handlers ─────────────────────────────────────────

  async function uploadManagedAsset(
    file: File,
    assetType: "image" | "video" | "music",
  ): Promise<ApiAsset> {
    setAssetLibraryError(null);
    const url = await uploadFileToStorage(file);
    const asset = await registerAsset({
      name: file.name,
      assetType,
      url,
      size: file.size || null,
    });

    setAssets((current) => mergeAssets([[asset], current]));
    return asset;
  }

  function handleMaterialAssetSelect(index: number, assetId: string) {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) {
      return;
    }

    setMaterials((current) =>
      current.map((material, materialIndex) =>
        materialIndex === index
          ? buildManualMaterialFromAsset({
              role: material.role,
              asset,
              source: "manual_library",
              type: asset.assetType === "video" ? "video" : "image",
            })
          : material,
      ),
    );
  }

  async function handleMaterialAssetUpload(
    index: number,
    file: File,
    assetType: "image" | "video",
  ) {
    const currentMaterial = materials[index];
    if (!currentMaterial) {
      return;
    }

    const asset = await uploadManagedAsset(file, assetType);
    setMaterials((current) =>
      current.map((material, materialIndex) =>
        materialIndex === index
          ? buildManualMaterialFromAsset({
              role: material.role,
              asset,
              source: "manual_upload",
              type: assetType,
            })
          : material,
      ),
    );
  }

  function handleBackgroundMusicSelect(assetId: string) {
    const asset = assets.find((item) => item.id === assetId && item.assetType === "music");
    if (!asset) {
      return;
    }

    setBackgroundMusic({
      audioUrl: asset.url,
      assetId: asset.id,
      volume: backgroundMusic?.volume ?? 50,
      source: "manual_library",
    });
  }

  async function handleBackgroundMusicUpload(file: File) {
    const asset = await uploadManagedAsset(file, "music");
    setBackgroundMusic({
      audioUrl: asset.url,
      assetId: asset.id,
      volume: backgroundMusic?.volume ?? 50,
      source: "manual_upload",
    });
  }

  async function handleGenerateMaterialSuggestions() {
    if (!selectedScriptId) {
      setMaterialAssistError("请先完成文案选择，再生成 AI 补充素材。");
      return;
    }

    const resolvedPackagingId = selectedPackagingTemplateId;
    if (!resolvedPackagingId) {
      setMaterialAssistError("请先确认包装模板，再生成 AI 补充素材。");
      return;
    }

    const mappedStructureId = selectedCopyStructureCode
      ? mapCopyToVideoStructure(selectedCopyStructureCode)
      : undefined;

    setMaterialAssistLoading(true);
    setMaterialAssistError(null);

    try {
      const response = await generatePackagingMaterialSuggestions({
        scriptId: selectedScriptId,
        structureId: mappedStructureId,
        packagingTemplateId: resolvedPackagingId,
        scriptContentDraft: editedScript.trim(),
        existingItems: materials,
      });

      setMaterials((current) => {
        const { manual } = splitMaterialAssignments(current);
        return [...manual, ...response.suggestions];
      });
    } catch (error) {
      setMaterialAssistError(
        error instanceof Error ? error.message : "AI 素材补充失败，请稍后重试",
      );
    } finally {
      setMaterialAssistLoading(false);
    }
  }

  async function handleGenerateScripts() {
    if (!selectedOpeningCode || !selectedCopyStructureCode || !selectedEndingCode) {
      setTaskError("请先选择开场类型、文案结构和结尾类型");
      return;
    }
    if (!fallbackTemplateId) {
      setTaskError("暂无可用的模板，请稍后重试");
      return;
    }

    const mappedStructureId = mapCopyToVideoStructure(selectedCopyStructureCode);

    setIsGenerating(true);
    setGeneratedScripts([]);
    setSelectedScriptId(null);
    setEditedScript("");
    setStaleWarning(null);
    try {
      const result = await apiGenerateScripts({
        templateId: fallbackTemplateId,
        structureId: mappedStructureId,
        inputs: {},
        topicSelectionId: topicSelectionId,
        openingTypeCode: selectedOpeningCode,
        copyStructureCode: selectedCopyStructureCode,
        endingTypeCode: selectedEndingCode,
        ...(hotTopicId ? { hotTopicId, hotTopic: hotTopicTitle } : {}),
      });
      setGeneratedScripts(result.scripts);
      setIsDegraded(result.isDegraded ?? false);
      toast.success(`已生成 ${result.scripts.length} 条文案，请选择一条`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "文案生成失败，请重试";
      setTaskError(msg);
      toast.error(msg.includes("超时") ? "文案生成超时，请稍后重试" : "文案生成失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveScript() {
    if (!selectedScriptId || !editedScript.trim()) return;
    try {
      await updateScript(selectedScriptId, {
        content: editedScript.trim(),
        status: "selected",
      });
    } catch { /* ignore save errors, script content is in state */ }
  }

  async function handleProceedToPackaging() {
    if (!selectedScriptId || !editedScript.trim()) {
      return;
    }

    await handleSaveScript();
    nextPhase();
  }

  async function handleSubmit() {
    if (!editedScript.trim() || !selectedScriptId) return;
    setIsSubmitting(true);
    setTaskError(null);
    try {
      if (blockingAiMaterials.length > 0) {
        throw new Error("AI 补充素材正在准备中，请稍候再提交");
      }

      // Save script first
      await handleSaveScript();

      if (!selectedPackaging) {
        throw new Error("请先选择包装模板");
      }

      if (resolvedPackagingRecommendation?.tier === "blocked") {
        throw new Error(
          resolvedPackagingRecommendation.blockingReasons?.[0]
            ?? "当前包装模板与这条视频存在真实能力冲突，请改选其他模板",
        );
      }

      const styleId = selectedPackaging.shanjianId;
      if (!styleId) {
        throw new Error("当前视频没有可用的包装 styleId");
      }

      const usableMaterials = materials.filter((m) => isAiMaterial(m) || !!m.assetId);
      if (usableMaterials.length === 0) {
        throw new Error("请先在包装阶段补充至少一个可用素材，再生成视频");
      }

      const mappedStructureId = selectedCopyStructureCode
        ? mapCopyToVideoStructure(selectedCopyStructureCode)
        : null;

      const recommendationContext = buildPackagingRecommendationContext({
        structureId: mappedStructureId,
        scriptId: selectedScriptId,
        packagingTemplateId: resolvedPackaging?.id ?? null,
        recommendation: resolvedPackagingRecommendation,
      });

      // Create production plan
      const plan = await createProductionPlan({
        scriptId: selectedScriptId,
        contentTemplateId: fallbackTemplateId || undefined,
        packagingTemplateId: selectedPackagingTemplateId || undefined,
        structureId: mappedStructureId || undefined,
        styleId,
        materials: usableMaterials,
        backgroundMusic: backgroundMusic ?? undefined,
        packRules: resolvedPackagingRecommendation?.presetPackRules ?? undefined,
        processRules: resolvedPackagingRecommendation?.presetProcessRules ?? undefined,
        recommendationContext,
        videoType: "broadcast_mixcut",
      });

      // Create video task with production plan
      const taskParams: Record<string, unknown> = {
        type: "broadcast_mixcut",
        scriptId: selectedScriptId,
        scriptContent: editedScript.trim(),
        productionPlanId: plan.id,
        styleId,
      };

      const task = await createVideoTask(taskParams);
      setTaskId(task.id);
      setTaskStatus(task.status);
      localStorage.removeItem(DRAFT_KEY);
      if (task.status === "queued") {
        toast.info("当前使用人数较多，您的视频已排队，将自动开始生成");
      } else {
        toast.success("视频任务已提交，正在生成中");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "提交失败，请重试";
      setTaskError(msg);
      toast.error(msg);
      setIsSubmitting(false);
    }
  }

  // ─── Phase navigation ─────────────────────────────────

  function goToPhase(phase: number) {
    if (phase < currentPhase) {
      setCurrentPhase(phase);
    }
  }

  function nextPhase() {
    const next = Math.min(currentPhase + 1, 3);
    saveDraft({ currentPhase: next });
    setStaleWarning(null);
    setCurrentPhase(next);
  }

  function prevPhase() {
    const previous = Math.max(currentPhase - 1, 0);
    saveDraft({ currentPhase: previous });
    setCurrentPhase(previous);
  }

  // ─── Render ───────────────────────────────────────────

  if (taskId && !taskError) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <ProductFlowOverview
          ipProfileReady={ipProfileReady}
          hasThreeDPositioning={hasThreeDPositioning}
          topicReady={!!selectedTopicCard}
          scriptReady={!!selectedScriptId && !!editedScript.trim()}
          qualityChecked={false}
          hotTopicTitle={hotTopicTitle}
        />
        <SubmissionPolling taskStatus={taskStatus} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8">
      <PageHeader />
      <ProductFlowOverview
        ipProfileReady={ipProfileReady}
        hasThreeDPositioning={hasThreeDPositioning}
        topicReady={!!selectedTopicCard}
        scriptReady={!!selectedScriptId && !!editedScript.trim()}
        qualityChecked={!!selectedScriptId && !!editedScript.trim()}
        hotTopicTitle={hotTopicTitle}
      />
      <PhaseIndicator currentPhase={currentPhase} onPhaseClick={goToPhase} readiness={[phase0Ready, phase1Ready, phase2Ready, phase3Ready]} />

      {staleWarning && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-amber-800 font-medium">{staleWarning}</p>
              <Button type="button" variant="ghost" size="sm" className="mt-1 text-amber-700 cursor-pointer" onClick={() => setStaleWarning(null)}>
                我知道了
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentPhase === 0 && (
        <PhaseTopic
          topicCards={topicCards}
          topicSelectionId={topicSelectionId}
          selectedTopicIndex={selectedTopicIndex}
          selectedTopicCard={selectedTopicCard}
          topicLoading={topicLoading}
          topicRefreshCount={topicRefreshCount}
          hotTopicTitle={hotTopicTitle}
          ipProfileReady={ipProfileReady}
          ipProfileLoading={false}
          onGenerateTopics={async () => {
            setTopicLoading(true);
            try {
              const result = await generateTopics({ refreshCount: topicRefreshCount });
              setTopicCards(result.cards);
              setTopicSelectionId(result.topicSelectionId);
              setSelectedTopicIndex(null);
              setSelectedTopicCard(null);
              setTopicRefreshCount((c) => c + 1);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "选题生成失败，请重试");
            } finally {
              setTopicLoading(false);
            }
          }}
          onSelectTopic={async (index: number) => {
            const card = topicCards[index];
            if (!card || !topicSelectionId) return;
            setSelectedTopicIndex(index);
            setSelectedTopicCard(card);
            // Pre-fill copywriting codes from topic recommendation
            setSelectedOpeningCode(card.openingTypeCode);
            setSelectedCopyStructureCode(card.structureCode);
            try {
              await selectTopic(topicSelectionId, index);
            } catch {
              // Selection is saved locally even if API fails
            }
          }}
          onNext={nextPhase}
        />
      )}

      {currentPhase === 1 && (
        <PhaseCopywriting
          selectedTopicCard={selectedTopicCard}
          openingTypes={openingTypes}
          copyStructures={copyStructures}
          endingTypes={endingTypes}
          selectedOpeningCode={selectedOpeningCode}
          selectedCopyStructureCode={selectedCopyStructureCode}
          selectedEndingCode={selectedEndingCode}
          onSelectOpening={(code: string) => {
            setSelectedOpeningCode(code);
            handleCopywritingOptionChange();
          }}
          onSelectCopyStructure={(code: string) => {
            setSelectedCopyStructureCode(code);
            handleCopywritingOptionChange();
          }}
          onSelectEnding={(code: string) => {
            setSelectedEndingCode(code);
            handleCopywritingOptionChange();
          }}
          generatedScripts={generatedScripts}
          selectedScriptId={selectedScriptId}
          onSelectScript={handleScriptChange}
          editedScript={editedScript}
          onEditScript={handleEditedScriptChange}
          isGenerating={isGenerating}
          isDegraded={isDegraded}
          onGenerate={handleGenerateScripts}
          ipProfile={null}
          hotTopicTitle={hotTopicTitle}
          onNext={handleProceedToPackaging}
          onBack={prevPhase}
        />
      )}

      {currentPhase === 2 && (
        <PhasePackaging
          packagingTemplates={packagingTemplates}
          loading={packagingLoading}
          syncing={packagingSyncing}
          errorMessage={packagingError}
          selectedId={selectedPackagingTemplateId}
          onSelect={handlePackagingTemplateChange}
          onRetrySync={() => loadPackagingTemplates({ forceSync: true })}
          templateDefaultPackagingName={null}
          canProceed={phase2Ready}
          materials={materials}
          onMaterialsChange={setMaterials}
          backgroundMusic={backgroundMusic}
          onBackgroundMusicChange={setBackgroundMusic}
          assets={assets}
          assetsLoading={assetsLoading}
          assetLibraryError={assetLibraryError}
          materialAssistLoading={materialAssistLoading}
          materialAssistError={materialAssistError}
          selectedRecommendation={resolvedPackagingRecommendation}
          blockingAiCount={blockingAiMaterials.length}
          incompleteManualCount={incompleteManualMaterials.length}
          onRefreshAssets={loadAssets}
          onGenerateMaterials={handleGenerateMaterialSuggestions}
          onMaterialAssetSelect={handleMaterialAssetSelect}
          onMaterialAssetUpload={handleMaterialAssetUpload}
          onBackgroundMusicSelect={handleBackgroundMusicSelect}
          onBackgroundMusicUpload={handleBackgroundMusicUpload}
          editedScript={editedScript}
          onNext={nextPhase}
          onBack={prevPhase}
        />
      )}

      {currentPhase === 3 && (
        <PhaseGenerate
          resolvedPackagingLabel={resolvedPackagingLabel}
          selectedPackagingRecommendation={resolvedPackagingRecommendation}
          hasResolvedPackaging={phase2Ready}
          editedScript={editedScript}
          materials={materials}
          backgroundMusic={backgroundMusic}
          blockingAiCount={blockingAiMaterials.length}
          incompleteManualCount={incompleteManualMaterials.length}
          isSubmitting={isSubmitting}
          taskError={taskError}
          onSubmit={handleSubmit}
          onSaveDraft={saveDraft}
          onBack={prevPhase}
        />
      )}
    </div>
  );
}

// ─── Page Header ────────────────────────────────────────

function PageHeader() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">明远AIM智能体</h1>
        <Badge variant="outline" className="text-[10px] sm:text-xs">
          AI内容总监
        </Badge>
      </div>
      <p className="text-muted-foreground mt-0.5 sm:mt-1 text-xs sm:text-sm">
        把业务资料、老板经验、项目案例沉淀成可持续生产的内容资产。
      </p>
    </div>
  );
}

function ProductFlowOverview({
  ipProfileReady,
  hasThreeDPositioning,
  topicReady,
  scriptReady,
  qualityChecked,
  hotTopicTitle,
}: {
  ipProfileReady: boolean;
  hasThreeDPositioning: boolean;
  topicReady: boolean;
  scriptReady: boolean;
  qualityChecked: boolean;
  hotTopicTitle: string | null;
}) {
  const completed = [
    ipProfileReady,
    hasThreeDPositioning,
    topicReady,
    scriptReady,
    qualityChecked,
  ];

  return (
    <Card className="border-primary/15 bg-primary/[0.02]">
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">核心流程</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              基础问卷 → 三维 IP 档案 → 4 个选题 → 自动文案 → 审核与热点融合
            </p>
          </div>
          {hotTopicTitle ? (
            <Badge variant="outline" className="w-fit border-orange-300 text-orange-600">
              热点融合：{hotTopicTitle}
            </Badge>
          ) : (
            <Badge variant="secondary" className="w-fit">热点融合可选</Badge>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {PRODUCT_FLOW_STEPS.map((label, index) => {
            const done = completed[index];
            const active = !done && completed.slice(0, index).every(Boolean);
            return (
              <div
                key={label}
                className={`rounded-md border px-3 py-2 text-xs ${
                  done
                    ? "border-green-200 bg-green-50 text-green-700"
                    : active
                      ? "border-primary/30 bg-background text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[10px]">
                      {index + 1}
                    </span>
                  )}
                  <span className="font-medium">{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ScriptCommandCenter({
  title,
  subtitle,
  script,
  stage,
  badges = [],
}: {
  title: string;
  subtitle: string;
  script: string;
  stage: string;
  badges?: string[];
}) {
  const normalizedScript = script.trim();
  const charCount = normalizedScript.length;
  const duration = Math.max(0, Math.ceil(charCount / 3.5));

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 text-primary">
                {stage}
              </Badge>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {title}
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-xs">{charCount} 字</Badge>
            <Badge variant="secondary" className="text-xs">约 {duration} 秒</Badge>
          </div>
        </div>
        <div className="rounded-md border bg-background/70 p-3">
          <p className="text-sm leading-relaxed line-clamp-5">
            {normalizedScript || "文案还未就绪"}
          </p>
        </div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <Badge key={badge} variant="outline" className="text-xs">
                {badge}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Phase Indicator ─────────────────────────────────────

function PhaseIndicator({
  currentPhase,
  onPhaseClick,
  readiness,
}: {
  currentPhase: number;
  onPhaseClick: (phase: number) => void;
  readiness: boolean[];
}) {
  return (
    <nav aria-label="创建进度" className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto">
      {PHASES.map(({ label, layer }, index) => {
        const isCompleted = index < currentPhase;
        const isActive = index === currentPhase;
        const isReady = readiness[index];
        const canClick = isCompleted || isActive;

        return (
          <div key={index} className="flex items-center gap-0.5 sm:gap-1">
            {index > 0 && (
              <div
                className={`h-px w-4 sm:w-10 border-t-2 border-dashed transition-colors duration-200 shrink-0 ${
                  isCompleted ? "border-primary" : "border-border"
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => canClick && onPhaseClick(index)}
              className={`flex items-center gap-1 sm:gap-2 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium transition-colors duration-200 whitespace-nowrap shrink-0 ${
                isCompleted
                  ? "bg-primary text-primary-foreground cursor-pointer hover:opacity-90"
                  : isActive
                    ? "bg-primary/10 text-primary ring-1 ring-primary/30 cursor-default"
                    : "bg-muted text-muted-foreground cursor-default"
              }`}
              aria-current={isActive ? "step" : undefined}
            >
              {isCompleted ? (
                <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              ) : isReady ? (
                <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
              ) : (
                <span className="flex h-3.5 w-3.5 sm:h-4 sm:w-4 items-center justify-center text-[10px] sm:text-xs font-semibold">
                  {index + 1}
                </span>
              )}
              <span>{label}</span>
              <span className="hidden md:inline text-[10px] opacity-60">
                ({layer})
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

// ─── Phase 0: 选题 (Planning Layer) ─────────────────────

const ELEMENT_CODE_COLORS: Record<string, string> = {
  cost: "bg-green-100 text-green-700 border-green-200",
  authority: "bg-violet-100 text-violet-700 border-violet-200",
  curiosity: "bg-sky-100 text-sky-700 border-sky-200",
  trust: "bg-emerald-100 text-emerald-700 border-emerald-200",
  emotion: "bg-rose-100 text-rose-700 border-rose-200",
  identity: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  novelty: "bg-amber-100 text-amber-700 border-amber-200",
  practical: "bg-blue-100 text-blue-700 border-blue-200",
  social: "bg-orange-100 text-orange-700 border-orange-200",
  scarcity: "bg-pink-100 text-pink-700 border-pink-200",
  story: "bg-indigo-100 text-indigo-700 border-indigo-200",
  contrast: "bg-teal-100 text-teal-700 border-teal-200",
};

const ELEMENT_CODE_NAMES: Record<string, string> = {
  cost: "低成本", authority: "权威背书", curiosity: "好奇驱动",
  trust: "信任铺垫", emotion: "情绪共鸣", identity: "身份认同",
  novelty: "新奇刺激", practical: "实用干货", social: "社交货币",
  scarcity: "稀缺紧迫", story: "故事叙事", contrast: "对比反差",
};

function getElementBadgeClass(code: string) {
  return ELEMENT_CODE_COLORS[code] ?? "bg-muted text-muted-foreground";
}

function getElementName(code: string) {
  return ELEMENT_CODE_NAMES[code] ?? code;
}

function PhaseTopic({
  topicCards,
  topicSelectionId,
  selectedTopicIndex,
  selectedTopicCard,
  topicLoading,
  topicRefreshCount,
  hotTopicTitle,
  ipProfileReady,
  ipProfileLoading,
  onGenerateTopics,
  onSelectTopic,
  onNext,
}: {
  topicCards: ApiTopicCard[];
  topicSelectionId: string | null;
  selectedTopicIndex: number | null;
  selectedTopicCard: ApiTopicCard | null;
  topicLoading: boolean;
  topicRefreshCount: number;
  hotTopicTitle: string | null;
  ipProfileReady: boolean;
  ipProfileLoading: boolean;
  onGenerateTopics: () => void;
  onSelectTopic: (index: number) => void;
  onNext: () => void;
}) {
  // Auto-generate on first mount
  const hasAutoGenerated = useRef(false);
  useEffect(() => {
    if (ipProfileReady && !hasAutoGenerated.current && topicCards.length === 0 && !topicLoading) {
      hasAutoGenerated.current = true;
      onGenerateTopics();
    }
  }, [ipProfileReady, topicCards.length, topicLoading, onGenerateTopics]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          内容生产官 · 选题输入
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
          先确定这条口播要讲什么，后续文案、包装和素材都会围绕这个表达目标展开。
        </p>
      </div>

      {!ipProfileReady && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              {ipProfileLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-amber-800">首次进入需要先建立 IP 档案</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  完成 5 个基础问题后，AI 会自动生成商业定位、人设定位、内容定位，确认后才能生成选题。
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="cursor-pointer shrink-0"
              onClick={() => { window.location.href = "/ip-profile"; }}
            >
              去完成基础问卷
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Hot topic banner from home page */}
      {hotTopicTitle && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex items-center gap-3 py-3">
            <Flame className="h-4 w-4 text-orange-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-orange-800">
                追热点：{hotTopicTitle}
              </p>
              <p className="text-xs text-orange-600 mt-0.5">
                热点话题将融入 AI 文案生成，提升时效性和流量潜力
              </p>
            </div>
            <Badge variant="outline" className="text-orange-600 border-orange-300 shrink-0">
              热点加持
            </Badge>
          </CardContent>
        </Card>
      )}

      {topicLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-1"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : topicCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {topicCards.map((card, index) => {
            const isSelected = selectedTopicIndex === index;
            return (
              <Card
                key={`${topicSelectionId}-${index}`}
                className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                  isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                }`}
                onClick={() => onSelectTopic(index)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm sm:text-base leading-tight">{card.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {card.elementCodes.map((code) => (
                      <Badge key={code} variant="outline" className={`text-[10px] sm:text-xs ${getElementBadgeClass(code)}`}>
                        {getElementName(code)}
                      </Badge>
                    ))}
                  </div>
                  {card.rationale && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{card.rationale}</p>
                  )}
                  {isSelected && (
                    <div className="flex items-center gap-1 text-primary text-xs font-medium pt-1">
                      <Check className="h-3.5 w-3.5" /> 已选择
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="text-sm text-muted-foreground">
            点击下方按钮生成选题方向
          </CardContent>
        </Card>
      )}

      {/* Refresh button */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onGenerateTopics}
          disabled={topicLoading || !ipProfileReady}
          className="cursor-pointer gap-1.5"
        >
          {topicLoading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />生成中...</>
          ) : (
            <><RefreshCw className="h-3.5 w-3.5" />换一批</>
          )}
        </Button>
        {topicRefreshCount >= 3 && (
          <span className="text-xs text-muted-foreground">已优化结果</span>
        )}
      </div>

      {/* Spacer for sticky bottom bar */}
      <div className="h-20" />

      {/* Sticky bottom action bar */}
      {selectedTopicCard && topicSelectionId && (
        <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex justify-end max-w-4xl mx-auto">
            <Button type="button" onClick={onNext} className="cursor-pointer">
              下一步：定文案 <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Phase 1: 定文案 (Copywriting Layer) ────────────────

function PhaseCopywriting({
  selectedTopicCard,
  openingTypes,
  copyStructures,
  endingTypes,
  selectedOpeningCode,
  selectedCopyStructureCode,
  selectedEndingCode,
  onSelectOpening,
  onSelectCopyStructure,
  onSelectEnding,
  generatedScripts,
  selectedScriptId,
  onSelectScript,
  editedScript,
  onEditScript,
  isGenerating,
  isDegraded,
  onGenerate,
  ipProfile,
  hotTopicTitle,
  onNext,
  onBack,
}: {
  selectedTopicCard: ApiTopicCard | null;
  openingTypes: ApiOpeningType[];
  copyStructures: ApiCopyStructure[];
  endingTypes: ApiEndingType[];
  selectedOpeningCode: string | null;
  selectedCopyStructureCode: string | null;
  selectedEndingCode: string | null;
  onSelectOpening: (code: string) => void;
  onSelectCopyStructure: (code: string) => void;
  onSelectEnding: (code: string) => void;
  generatedScripts: ApiScript[];
  selectedScriptId: string | null;
  onSelectScript: (id: string) => void;
  editedScript: string;
  onEditScript: (v: string) => void;
  isGenerating: boolean;
  isDegraded: boolean;
  onGenerate: () => void;
  ipProfile: IpProfileResponse | null;
  hotTopicTitle?: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const [openSection1, setOpenSection1] = useState(false);
  const [openSection2, setOpenSection2] = useState(false);
  const [openSection3, setOpenSection3] = useState(false);

  // Quality check state
  const [qualityReport, setQualityReport] = useState<QualityCheckReport | null>(null);
  const [isCheckingQuality, setIsCheckingQuality] = useState(false);
  const [qualityCheckError, setQualityCheckError] = useState<string | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [autoChecked, setAutoChecked] = useState(false);
  const autoCheckTriggeredRef = useRef<string | null>(null);

  const profile = ipProfile?.profile;
  const canGenerate =
    !isGenerating
    && !!selectedOpeningCode
    && !!selectedCopyStructureCode
    && !!selectedEndingCode
    && !!profile?.isComplete;
  const selectedOpening = openingTypes.find((item) => item.code === selectedOpeningCode);
  const selectedStructure = copyStructures.find((item) => item.code === selectedCopyStructureCode);
  const selectedEnding = endingTypes.find((item) => item.code === selectedEndingCode);

  // Auto-run quality check when a script is first selected
  useEffect(() => {
    if (selectedScriptId && editedScript.trim() && selectedScriptId !== autoCheckTriggeredRef.current) {
      autoCheckTriggeredRef.current = selectedScriptId;
      setAutoChecked(true);
      setQualityReport(null);
      setQualityCheckError(null);
      setIsCheckingQuality(true);
      checkScriptQuality({
        content: editedScript.trim(),
        topicTitle: selectedTopicCard?.title,
        persona: profile?.displayName ?? undefined,
      })
        .then(setQualityReport)
        .catch((error) => {
          setQualityCheckError(
            error instanceof Error ? error.message : "自动质量检查失败，请手动重试"
          );
        })
        .finally(() => setIsCheckingQuality(false));
    }
  }, [selectedScriptId, editedScript, selectedTopicCard?.title, profile?.displayName]);

  function handleEditedScriptInput(nextValue: string) {
    onEditScript(nextValue);
    setQualityReport(null);
    setQualityCheckError(null);
    setAutoChecked(false);
  }

  async function handleQualityCheck() {
    if (!editedScript.trim()) {
      setQualityCheckError("请先输入文案内容");
      return;
    }

    setIsCheckingQuality(true);
    setQualityCheckError(null);
    setQualityReport(null);

    try {
      const report = await checkScriptQuality({
        content: editedScript.trim(),
        topicTitle: selectedTopicCard?.title,
        persona: profile?.displayName ?? undefined,
      });
      setQualityReport(report);
    } catch (error) {
      setQualityCheckError(
        error instanceof Error ? error.message : "质量检查失败，请稍后重试"
      );
    } finally {
      setIsCheckingQuality(false);
    }
  }

  async function handlePolish() {
    if (!editedScript.trim()) return;

    // Determine weak dimensions from quality report
    const weakDimensions: string[] = [];
    if (qualityReport) {
      if (!qualityReport.aiTaste.passed) weakDimensions.push("aiTaste");
      if (!qualityReport.editorial.passed) weakDimensions.push("editorial");
      if (!qualityReport.attraction.passed) weakDimensions.push("attraction");
      if (!qualityReport.logic.passed) weakDimensions.push("logic");
    }

    setIsPolishing(true);
    try {
      const result = await polishScript({
        content: editedScript.trim(),
        weakDimensions,
        topicTitle: selectedTopicCard?.title,
        persona: profile?.displayName ?? undefined,
      });
      onEditScript(result.polished);
      toast.success("AI 润色完成，请查看修改后的文案");
      setQualityReport(null);
      setQualityCheckError(null);
      setAutoChecked(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 润色失败，请重试");
    } finally {
      setIsPolishing(false);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-8">
      <div>
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <PenLine className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          内容生产官 · 生成与定稿
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
          这里是主流程核心：先选表达结构，再生成、质检、润色并锁定最终口播文案。
        </p>
      </div>

      {/* Selected topic summary */}
      {selectedTopicCard && (
        <Card className="bg-muted/30">
          <CardContent className="flex items-start gap-2 sm:gap-3">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <span className="text-xs sm:text-sm font-medium">{selectedTopicCard.title}</span>
              <div className="flex flex-wrap gap-1">
                {selectedTopicCard.elementCodes.map((code) => (
                  <Badge key={code} variant="outline" className={`text-[10px] sm:text-xs ${getElementBadgeClass(code)}`}>
                    {getElementName(code)}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/15 bg-primary/[0.02]">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">自动整理脚本表达</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                系统会基于选题整理开头、正文和结尾；你也可以展开手动微调。
              </p>
            </div>
            <Badge variant="outline" className="shrink-0">可手动微调</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-xs text-muted-foreground">开头</p>
              <p className="text-sm font-medium mt-0.5">{selectedOpening?.name ?? "待匹配"}</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-xs text-muted-foreground">文案结构</p>
              <p className="text-sm font-medium mt-0.5">{selectedStructure?.name ?? "待匹配"}</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-xs text-muted-foreground">结尾</p>
              <p className="text-sm font-medium mt-0.5">{selectedEnding?.name ?? "待匹配"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Opening Types */}
      <div className="space-y-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left cursor-pointer"
          onClick={() => setOpenSection1(!openSection1)}
        >
          <div>
            <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <PenLine className="h-4 w-4 text-primary" />
              开场类型
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">选择视频的开场方式</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSection1 ? "rotate-180" : ""}`} />
        </button>
        {openSection1 && (
          openingTypes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {openingTypes.map((ot) => {
                const isSelected = selectedOpeningCode === ot.code;
                return (
                  <Card
                    key={ot.id}
                    className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                      isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                    }`}
                    onClick={() => onSelectOpening(ot.code)}
                  >
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{ot.name}</CardTitle>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground leading-relaxed">{ot.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
              ))}
            </div>
          )
        )}
      </div>

      <Separator />

      {/* Section 2: Copy Structures */}
      <div className="space-y-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left cursor-pointer"
          onClick={() => setOpenSection2(!openSection2)}
        >
          <div>
            <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              文案结构
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">选择文案的叙事结构</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSection2 ? "rotate-180" : ""}`} />
        </button>
        {openSection2 && (
          copyStructures.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {copyStructures.map((cs) => {
                const isSelected = selectedCopyStructureCode === cs.code;
                return (
                  <Card
                    key={cs.id}
                    className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                      isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                    }`}
                    onClick={() => onSelectCopyStructure(cs.code)}
                  >
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{cs.name}</CardTitle>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-xs text-muted-foreground leading-relaxed">{cs.description}</p>
                      {cs.beats && cs.beats.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {cs.beats.map((beat) => (
                            <Badge key={beat.key} variant="secondary" className="text-[10px]">
                              {beat.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
              ))}
            </div>
          )
        )}
      </div>

      <Separator />

      {/* Section 3: Ending Types */}
      <div className="space-y-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left cursor-pointer"
          onClick={() => setOpenSection3(!openSection3)}
        >
          <div>
            <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-primary" />
              结尾类型
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">选择视频的结尾方式</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSection3 ? "rotate-180" : ""}`} />
        </button>
        {openSection3 && (
          endingTypes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {endingTypes.map((et) => {
                const isSelected = selectedEndingCode === et.code;
                return (
                  <Card
                    key={et.id}
                    className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                      isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                    }`}
                    onClick={() => onSelectEnding(et.code)}
                  >
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{et.name}</CardTitle>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground leading-relaxed">{et.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
              ))}
            </div>
          )
        )}
      </div>

      {/* IP Profile info */}
      <Separator />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium">IP 档案信息（自动读取）</CardTitle>
        </CardHeader>
        <CardContent>
          {profile ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {profile.displayName && (
                <div><span className="text-muted-foreground">IP 名称：</span><span className="font-medium">{profile.displayName}</span></div>
              )}
              {profile.industry && (
                <div><span className="text-muted-foreground">行业：</span><span className="font-medium">{profile.industry}</span></div>
              )}
              {profile.primaryOffer && (
                <div className="sm:col-span-2"><span className="text-muted-foreground">主打内容：</span><span className="font-medium">{profile.primaryOffer}</span></div>
              )}
              {profile.targetAudience && (
                <div className="sm:col-span-2"><span className="text-muted-foreground">目标受众：</span><span className="font-medium">{profile.targetAudience}</span></div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              未找到 IP 档案，请先前往
              <a href="/ip-profile" className="text-primary underline-offset-4 hover:underline ml-1">完善 IP 档案</a>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Generate scripts button */}
      <div className="flex flex-col items-center gap-2">
        {hotTopicTitle && (
          <div className="flex items-center gap-1.5 text-xs text-orange-600">
            <Flame className="h-3.5 w-3.5" />
            <span>热点「{hotTopicTitle}」将融入文案生成</span>
          </div>
        )}
        <Button size="lg" onClick={onGenerate} disabled={!canGenerate} className="cursor-pointer gap-2 px-8">
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />内容生产官创作中...</>
          ) : (
            <><Sparkles className="h-4 w-4" />{hotTopicTitle ? "热点融合写文案" : "启动内容生产官"}</>
          )}
        </Button>
      </div>

      {/* Generated scripts */}
      {generatedScripts.length > 0 && (
        <div className="space-y-4">
          <Separator />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              AI 生成了 {generatedScripts.length} 条文案，请选择一条：
            </h3>
            {isDegraded && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />质量偏低，建议优化选题后重新生成
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            {generatedScripts.map((script, index) => {
              const isSelected = selectedScriptId === script.id;
              const score = script.qualityScore;
              return (
                <Card
                  key={script.id}
                  className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                    isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                  }`}
                  onClick={() => onSelectScript(script.id)}
                >
                  <CardContent>
                    <div className="flex items-start gap-3">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm leading-relaxed">{script.content}</p>
                        {score != null && (
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant={score >= 70 ? "default" : score >= 50 ? "secondary" : "outline"} className="text-xs">
                              质量分：{Math.round(score)}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-1 text-primary text-xs font-medium mt-2 ml-9">
                        <Check className="h-3.5 w-3.5" /> 已选择
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit script */}
      {selectedScriptId && (
        <div className="space-y-3">
          <Separator />
          <Card className="border-primary/20 bg-primary/[0.02]">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    文案审核 & 热点融合
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    选择文案后自动检查四个维度；热点融合是可选项，可以从实时热点入口进入。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {hotTopicTitle ? (
                    <Badge variant="outline" className="border-orange-300 text-orange-600">
                      已结合热点：{hotTopicTitle}
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer gap-1.5"
                      onClick={() => { window.location.href = "/home"; }}
                    >
                      <Flame className="h-3.5 w-3.5" />结合热点
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleQualityCheck}
                    disabled={isCheckingQuality || !editedScript.trim()}
                    className="cursor-pointer gap-1.5"
                  >
                    {isCheckingQuality ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />检查中...</>
                    ) : (
                      <><Wand2 className="h-3.5 w-3.5" />质量检查</>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isCheckingQuality && (
                <div className="flex items-start gap-3 rounded-md border bg-background/70 p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">正在执行四维质量检查</p>
                    <p className="text-xs text-muted-foreground mt-0.5">编辑质量、AI 味、吸引力、逻辑性会一起评估。</p>
                  </div>
                </div>
              )}

              {qualityCheckError && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="flex items-start gap-3 py-3">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-red-800 font-medium">质量检查失败</p>
                      <p className="text-xs text-red-600 mt-0.5">{qualityCheckError}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {qualityReport && (
                <QualityReportCard
                  report={qualityReport}
                  onPolish={handlePolish}
                  isPolishing={isPolishing}
                />
              )}

              {!qualityReport && !isCheckingQuality && !qualityCheckError && (
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">
                      {autoChecked ? "尚未完成质量检查" : "当前文案需要质量检查"}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">建议先确认文案达标后再进入下一步，质量门控只提醒，不会阻止继续生成。</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-script" className="text-sm font-semibold text-muted-foreground">编辑文案（可修改）</Label>
            </div>
            <Textarea
              id="edit-script"
              value={editedScript}
              onChange={(e) => handleEditedScriptInput(e.target.value)}
              rows={5}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              约 {editedScript.length} 字，预估时长 {Math.ceil(editedScript.length / 3.5)} 秒
            </p>
          </div>

        </div>
      )}

      {!selectedScriptId && generatedScripts.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-3">
            <Wand2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">选择一条文案后会进入质量门控</p>
              <p className="text-xs text-muted-foreground mt-0.5">系统会自动执行四维质检，并在不通过时提供 AI 润色入口。</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spacer for sticky bottom bar */}
      <div className="h-20" />

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Button type="button" variant="outline" onClick={onBack} className="cursor-pointer">
            <ChevronLeft className="h-4 w-4 mr-1" /> 上一步
          </Button>
          {selectedScriptId && editedScript.trim() && (
            <div className="flex items-center gap-2">
              {qualityReport && !qualityReport.overall.passed && (
                <span className="text-xs text-amber-600">⚠ 质量未通过，建议先润色</span>
              )}
              {!qualityReport && !isCheckingQuality && (
                <span className="text-xs text-amber-600">⚠ 未质检</span>
              )}
              <Button type="button" onClick={onNext} className="cursor-pointer">
                下一步：定包装 <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Phase 2: 定包装 (Packaging Layer) ──────────────────

const MATERIAL_ROLES = [
  { value: "product_detail", label: "产品细节", aiEligible: true },
  { value: "store_environment", label: "门店环境", aiEligible: true },
  { value: "process", label: "操作过程", aiEligible: true },
  { value: "customer_case", label: "客户案例", aiEligible: false },
  { value: "qualification", label: "资质证明", aiEligible: false },
  { value: "before_after", label: "Before/After", aiEligible: false },
] as const;

const PACKAGING_CAPABILITY_LABELS: Record<string, string> = {
  strong_title: "标题栏",
  subtitle: "字幕",
  heavy_subtitle: "强字幕",
  identity_card: "身份栏",
  evidence_insert: "证据插入",
  pip: "画中画",
  visual_first: "画面主导",
};

function getMaterialRoleLabel(role: string) {
  return MATERIAL_ROLES.find((item) => item.value === role)?.label ?? role;
}

function MaterialPreview({ material }: { material: MaterialAssignment }) {
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

function PhasePackaging({
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
  const [templateSearch, setTemplateSearch] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<ApiVideoPackagingTemplate | null>(null);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);
  const [previewAiMaterial, setPreviewAiMaterial] = useState<{ material: MaterialAssignment; index: number } | null>(null);
  const [uploadingMaterialIndex, setUploadingMaterialIndex] = useState<number | null>(null);
  const [uploadingBgm, setUploadingBgm] = useState(false);
  const materialFileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});
  const backgroundMusicInputRef = useRef<HTMLInputElement | null>(null);

  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return packagingTemplates;
    const q = templateSearch.trim().toLowerCase();
    return packagingTemplates.filter((t) => t.name.toLowerCase().includes(q));
  }, [packagingTemplates, templateSearch]);

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
  const recommendedTemplate = useMemo(
    () => packagingTemplates.find((template) => template.recommendation?.tier === "recommended") ?? null,
    [packagingTemplates],
  );

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
                      removeMaterial(previewAiMaterial.index);
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
                  onClick={(e) => { e.stopPropagation(); removeMaterial(index); }}
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
                onClick={() => addMaterial(role.value)}
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
                                updateMaterial(index, {
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
                                setAssetActionError(null);
                                if (!event.target.value) {
                                  updateMaterial(index, {
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
                            void handleMaterialUpload(index, file, material.type);
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
                          onClick={() => removeMaterial(index)}
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

// ─── Phase 3: 出视频 (Summary + Submit) ─────────────────

function PhaseGenerate({
  resolvedPackagingLabel,
  selectedPackagingRecommendation,
  hasResolvedPackaging,
  editedScript,
  materials,
  backgroundMusic,
  blockingAiCount,
  incompleteManualCount,
  isSubmitting,
  taskError,
  onSubmit,
  onSaveDraft,
  onBack,
}: {
  resolvedPackagingLabel: string;
  selectedPackagingRecommendation: ApiPackagingTemplateRecommendation | null;
  hasResolvedPackaging: boolean;
  editedScript: string;
  materials: MaterialAssignment[];
  backgroundMusic: BackgroundMusicSelection | null;
  blockingAiCount: number;
  incompleteManualCount: number;
  isSubmitting: boolean;
  taskError: string | null;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onBack: () => void;
}) {
  const manualMaterialCount = materials.filter((item) => item.source !== "ai_pexels" && item.source !== "ai_pixabay").length;
  const aiMaterialCount = materials.filter((item) => isAiMaterial(item)).length;
  const usableMaterialCount = materials.filter((item) => isAiMaterial(item) || !!item.assetId).length;

  // Can submit check
  const canSubmit = !!editedScript.trim() && !isSubmitting &&
    hasResolvedPackaging &&
    blockingAiCount === 0 &&
    usableMaterialCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" />
          内容生产官 · 成片确认
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          最后确认文案、包装模板、素材和背景音乐是否齐备，然后提交生成视频。
        </p>
      </div>

      <ScriptCommandCenter
        stage="待成片文案"
        title="这条文案将驱动整条视频"
        subtitle="系统会使用包装模板和素材完成画面呈现，不需要额外选择讲述形象。"
        script={editedScript}
        badges={["文案定稿", "素材承载信息点", "包装控制节奏"]}
      />

      {/* Production Summary */}
      <Separator />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            生产总览
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            确认以下所有选项无误后，点击生成视频
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1 sm:col-span-2">
              <p className="text-muted-foreground text-xs">文案层 · 最终口播</p>
              <p className="font-medium line-clamp-3">{editedScript || "未编辑"}</p>
              <p className="text-xs text-muted-foreground">约 {editedScript.length} 字 · 预估 {Math.ceil(editedScript.length / 3.5)} 秒</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">包装层 · 包装模板</p>
              <p className="font-medium">{resolvedPackagingLabel}</p>
              {selectedPackagingRecommendation && (
                <p className="text-xs text-muted-foreground">
                  {RECOMMENDATION_TIER_LABELS[selectedPackagingRecommendation.tier]} · 适配分 {selectedPackagingRecommendation.score}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">包装层 · 素材</p>
              <p className="font-medium">
                {materials.length > 0
                  ? `${manualMaterialCount} 个手动素材 + ${aiMaterialCount} 个 AI 素材`
                  : "无额外素材"}
              </p>
              {blockingAiCount > 0 && (
                <p className="text-xs text-amber-600">
                  其中 {blockingAiCount} 个 AI 素材正在准备中
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">包装层 · 背景音乐</p>
              <p className="font-medium">
                {backgroundMusic?.assetId ? "已覆盖为自定义 BGM" : "使用模板默认音乐"}
              </p>
              {selectedPackagingRecommendation?.bgmGuidance && (
                <p className="text-xs text-muted-foreground">
                  建议风格：{selectedPackagingRecommendation.bgmGuidance}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedPackagingRecommendation?.reasons?.length ? (
        <Card className="border-primary/15 bg-primary/[0.03]">
          <CardContent>
            <p className="text-sm font-medium">这套包装为什么成立</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {selectedPackagingRecommendation.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {blockingAiCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="text-sm text-amber-800">
            <p>AI 补充素材还有 {blockingAiCount} 个正在准备中，请等待完成后再提交。</p>
          </CardContent>
        </Card>
      )}
      {incompleteManualCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="text-sm text-amber-600">
            <p>手动素材里还有 {incompleteManualCount} 个卡片没有关联资产，提交时将自动跳过。</p>
          </CardContent>
        </Card>
      )}

      {/* Error display */}
      {taskError && (
        <Card className="border-red-300 bg-red-50">
          <CardContent>
            <p className="text-sm text-red-700">{taskError}</p>
          </CardContent>
        </Card>
      )}

      {/* Spacer for sticky bottom bar */}
      <div className="h-20" />

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Button type="button" variant="outline" onClick={onBack} className="cursor-pointer">
            <ChevronLeft className="h-4 w-4 mr-1" /> 上一步
          </Button>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button type="button" variant="outline" onClick={onSaveDraft} className="cursor-pointer hidden sm:flex">
              保存草稿
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="cursor-pointer gap-2"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />提交中...</>
              ) : (
                <><Play className="h-4 w-4" />生成视频</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Submission Polling ─────────────────────────────────

function SubmissionPolling({ taskStatus }: { taskStatus: string | null }) {
  const isQueued = taskStatus === "queued"

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <div className="relative">
        {isQueued ? (
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
            <Clock className="h-6 w-6 text-blue-600" />
          </div>
        ) : (
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        )}
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">
          {isQueued ? "任务排队中" : "视频生成中"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isQueued
            ? "当前使用人数较多，您的任务正在排队中，通常几分钟内会开始生成..."
            : taskStatus === "processing"
              ? "AI 正在为你制作视频，通常需要 1-3 分钟..."
              : "正在提交任务..."}
        </p>
      </div>
    </div>
  );
}
