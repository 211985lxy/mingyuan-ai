"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus,
  Upload,
  User,
  Users,
  Image as ImageIcon,
  Film,
  Music,
  Loader2,
  Clock,
  Volume2,
  FileVideo,
  X,
  Play,
  Pause,
  ChevronRight,
  ChevronLeft,
  Info,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createAvatar as apiCreateAvatar,
  getPublicAssets,
  listAssets,
  listAvatars,
  registerAsset,
  retryAvatar as apiRetryAvatar,
  uploadFileToStorage,
  saveAuthVideo,
} from "@/lib/api/client";
import { toast } from "sonner";
import { useBranding } from "@/components/providers/branding-provider";
import { useAuthStore } from "@/lib/store";
import type { ApiAsset, ApiAvatar } from "@/types/api";
import { PublicAvatarPreviewDialog } from "@/components/public-avatar-preview-dialog";
import {
  ASSET_FLOW_CARDS,
  assetFilters,
  assetTypeConfig,
  avatarStatusConfig,
  buildPersonalAvatarVoices,
  buildUserVoicesFromAssets,
  fetchPublicAssets,
  formatDate,
  getDefaultVoiceIdForPersonalAvatar,
  getLinkedVoiceForAvatar,
  getRecommendedVoiceId,
  type AssetFilter,
  type AssetType,
  type AvatarPreviewSelection,
  type PublicAvatar,
  type PublicVoice,
  type UserVoice,
} from "@/features/assets/asset-page-shared";

// ─── Main Page Component ────────────────────────────────

export default function AssetsPage() {
  const [avatars, setAvatars] = useState<ApiAvatar[]>([]);
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [publicAvatars, setPublicAvatars] = useState<PublicAvatar[]>([]);
  const [publicVoices, setPublicVoices] = useState<PublicVoice[]>([]);
  const userVoices = buildUserVoicesFromAssets(assets);

  const fetchAvatars = useCallback(async () => {
    setAvatarsLoading(true);
    try {
      const data = await listAvatars();
      setAvatars(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "数字人加载失败，请重试");
      setAvatars([]);
    } finally {
      setAvatarsLoading(false);
    }
  }, []);

  const fetchAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const data = await listAssets();
      setAssets(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "资产加载失败，请重试");
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvatars();
    fetchAssets();
    fetchPublicAssets().then(({ avatars: pa, voices: pv }) => {
      setPublicAvatars(pa);
      setPublicVoices(pv);
    });
  }, [fetchAvatars, fetchAssets]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">AIM 资产库</h1>
          <Badge variant="outline" className="text-[10px] sm:text-xs">
            企业营销资产沉淀
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          这里不是单纯上传文件，而是把企业资料、案例素材、客户反馈、声音资产沉淀成创作页可调用的证据库。
        </p>
        <AssetFlowOverview
          avatarCount={avatars.length}
          assetCount={assets.length}
          voiceCount={userVoices.length + publicVoices.length}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets" className="cursor-pointer">
            素材证据库
          </TabsTrigger>
          <TabsTrigger value="avatars" className="cursor-pointer">
            数字人与声音
          </TabsTrigger>
        </TabsList>

        {/* ─── 数字人 Tab ─────────────────────────────────── */}
        <TabsContent value="avatars" className="mt-6">
          <AvatarsTab
            avatars={avatars}
            loading={avatarsLoading}
            onRefresh={fetchAvatars}
            publicAvatars={publicAvatars}
            publicVoices={publicVoices}
            userVoices={userVoices}
          />
        </TabsContent>

        {/* ─── 素材 Tab ───────────────────────────────────── */}
        <TabsContent value="assets" className="mt-6">
          <AssetsTab
            assets={assets}
            loading={assetsLoading}
            onRefresh={fetchAssets}
            publicVoices={publicVoices}
            userVoices={userVoices}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AssetFlowOverview({
  avatarCount,
  assetCount,
  voiceCount,
}: {
  avatarCount: number;
  assetCount: number;
  voiceCount: number;
}) {
  return (
    <Card className="border-primary/15 bg-primary/[0.02]">
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {ASSET_FLOW_CARDS.map((item, index) => (
            <div key={item.title} className="rounded-md border bg-background px-3 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <p className="text-sm font-medium">{item.title}</p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">已沉淀素材 {assetCount}</Badge>
          <Badge variant="secondary">数字人 {avatarCount}</Badge>
          <Badge variant="secondary">可用声音 {voiceCount}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Avatars Tab ────────────────────────────────────────

function AvatarsTab({
  avatars,
  loading,
  onRefresh,
  publicAvatars,
  publicVoices,
  userVoices,
}: {
  avatars: ApiAvatar[];
  loading: boolean;
  onRefresh: () => void;
  publicAvatars: PublicAvatar[];
  publicVoices: PublicVoice[];
  userVoices: UserVoice[];
}) {
  const branding = useBranding();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [personalPreviewSelection, setPersonalPreviewSelection] =
    useState<AvatarPreviewSelection | null>(null);
  const [selectedPersonalVoiceId, setSelectedPersonalVoiceId] = useState<
    string | null
  >(null);
  const [publicPreviewAvatar, setPublicPreviewAvatar] = useState<
    AvatarPreviewSelection["avatar"] | null
  >(null);
  const [selectedPublicVoiceId, setSelectedPublicVoiceId] = useState<
    string | null
  >(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Wizard step: 1 = auth video, 2 = create avatar
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [cameFromStep1, setCameFromStep1] = useState(false);

  // Step 1: Auth video state
  const [authVideoFile, setAuthVideoFile] = useState<File | null>(null);
  const [isUploadingAuth, setIsUploadingAuth] = useState(false);
  const [authDragging, setAuthDragging] = useState(false);
  const authFileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Create avatar state
  const [name, setName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<"uploading" | "creating" | null>(
    null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Avatar retry state
  const [retryingAvatarId, setRetryingAvatarId] = useState<string | null>(null);

  async function handleRetryAvatar(avatarId: string) {
    setRetryingAvatarId(avatarId);
    try {
      await apiRetryAvatar(avatarId);
      toast.success("已重新提交克隆请求");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重试失败，请稍后再试");
    } finally {
      setRetryingAvatarId(null);
    }
  }

  // Determine starting step when dialog opens
  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (open) {
      const hasAuth = !!user?.authVideoUrl;
      setWizardStep(hasAuth ? 2 : 1);
      setCameFromStep1(false);
    } else {
      // Reset all state when closing
      setSubmitError(null);
      setSubmitStep(null);
      setAuthVideoFile(null);
      setIsUploadingAuth(false);
      setName("");
      setVideoFile(null);
      setIsSubmitting(false);
    }
  }

  // ─── Step 1: Auth video handlers ──────────────────────

  function handleAuthFileSelect(file: File) {
    if (!file.type.startsWith("video/")) return;
    setAuthVideoFile(file);
    setSubmitError(null);
  }

  function handleAuthFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleAuthFileSelect(file);
    e.target.value = "";
  }

  function handleAuthDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAuthDragging(true);
  }

  function handleAuthDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAuthDragging(false);
  }

  function handleAuthDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAuthDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleAuthFileSelect(file);
  }

  async function handleAuthNext() {
    if (!authVideoFile) return;
    setIsUploadingAuth(true);
    setSubmitError(null);
    try {
      const authVideoUrl = await uploadFileToStorage(authVideoFile);
      const updatedUser = await saveAuthVideo(authVideoUrl);
      updateUser(updatedUser);
      setCameFromStep1(true);
      setWizardStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : "上传失败，请重试";
      setSubmitError(message);
    } finally {
      setIsUploadingAuth(false);
    }
  }

  // ─── Step 2: Create avatar handlers ───────────────────

  function handleFileSelect(file: File) {
    if (!file.type.startsWith("video/")) return;
    setVideoFile(file);
    setSubmitError(null);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  async function handleCreateAvatar() {
    if (!name.trim() || !videoFile) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      setSubmitStep("uploading");
      const videoUrl = await uploadFileToStorage(videoFile);

      setSubmitStep("creating");
      await apiCreateAvatar({
        name: name.trim(),
        cloneType: "fast",
        videoUrl,
      });

      setDialogOpen(false);
      setName("");
      setVideoFile(null);
      onRefresh();
      toast.success("数字人创建已提交，克隆中请耐心等待");
    } catch (err) {
      const message = err instanceof Error ? err.message : "创建失败，请重试";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      setSubmitStep(null);
    }
  }

  if (loading) {
    return <AvatarsSkeleton />;
  }

  function openPublicAvatarPreview(avatar: PublicAvatar) {
    setSelectedPublicVoiceId(
      getRecommendedVoiceId(publicVoices, avatar.gender),
    );
    setPublicPreviewAvatar({
      ...avatar,
      source: "public",
    });
  }

  function openPersonalAvatarPreview(
    avatar: ApiAvatar,
    thumbnailUrl?: string | null,
  ) {
    if (!avatar.externalVirtualmanId) return;

    const voices = buildPersonalAvatarVoices(avatar, userVoices, publicVoices);
    const defaultVoiceId = getDefaultVoiceIdForPersonalAvatar(avatar, voices);
    const hasPrivateDefaultVoice =
      !!defaultVoiceId &&
      voices.some(
        (voice) => voice.id === defaultVoiceId && voice.source === "mine",
      );

    if (!hasPrivateDefaultVoice) return;

    setSelectedPersonalVoiceId(defaultVoiceId);
    setPersonalPreviewSelection({
      avatar: {
        id: avatar.id,
        name: avatar.name,
        coverUrl: avatar.coverUrl || thumbnailUrl || "",
        previewVirtualmanId: avatar.externalVirtualmanId,
        source: "mine",
      },
      voices,
    });
  }

  return (
    <div className="space-y-10">
      {/* ─── Section 1: 我的数字人 ─────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">我的数字人</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              您创建和管理的专属数字人形象
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger
              render={
                <Button className="cursor-pointer transition-colors duration-200" />
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              创建数字人
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              {/* ─── Step 1: Authorization Video ──────────── */}
              {wizardStep === 1 && (
                <>
                  <DialogHeader>
                    <DialogTitle>录制授权视频</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    {/* Guide card */}
                    <Card className="border-primary/20 bg-primary/5">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                          <p className="text-sm text-foreground">
                            根据平台规范，克隆数字人需要本人录制一段授权视频
                          </p>
                        </div>
                        <div className="space-y-1.5 pl-6">
                          <p className="text-sm font-medium text-foreground">
                            对着镜头清晰朗读以下内容：
                          </p>
                          <p className="text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">
                            &ldquo;我是______（真实姓名），我授权【{branding.name}
                            】使用视频中的肖像、声音，为我生成定制数字人及声音，并在本人【
                            {branding.name}】账号中创作使用。&rdquo;
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recording tips */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground pl-1">
                      <span>光线充足，安静环境</span>
                      <span>正对镜头，不遮挡面部</span>
                      <span>时长不超过 2 分钟</span>
                      <span>支持 MP4、MOV 格式</span>
                    </div>

                    {/* Auth video upload area */}
                    <div className="space-y-2">
                      <Label>上传授权视频</Label>
                      <input
                        ref={authFileInputRef}
                        type="file"
                        accept="video/mp4,video/quicktime,video/*"
                        className="hidden"
                        onChange={handleAuthFileInputChange}
                      />
                      {authVideoFile ? (
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
                          <FileVideo className="h-8 w-8 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {authVideoFile.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(authVideoFile.size / 1024 / 1024).toFixed(1)} MB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAuthVideoFile(null)}
                            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => authFileInputRef.current?.click()}
                          onDragOver={handleAuthDragOver}
                          onDragLeave={handleAuthDragLeave}
                          onDrop={handleAuthDrop}
                          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 transition-colors duration-200 cursor-pointer ${
                            authDragging
                              ? "border-primary bg-primary/5"
                              : "border-muted-foreground/25 bg-muted/50 hover:border-primary/50 hover:bg-muted"
                          }`}
                        >
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium text-muted-foreground">
                            点击或拖拽上传授权视频
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            支持 MP4、MOV 格式，时长不超过 2 分钟
                          </p>
                        </button>
                      )}
                    </div>

                    {/* Error message */}
                    {submitError && (
                      <p className="text-sm text-destructive">{submitError}</p>
                    )}

                    {/* Next button */}
                    <Button
                      onClick={handleAuthNext}
                      disabled={!authVideoFile || isUploadingAuth}
                      className="w-full cursor-pointer"
                    >
                      {isUploadingAuth && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {isUploadingAuth ? "上传中..." : "下一步"}
                      {!isUploadingAuth && (
                        <ChevronRight className="h-4 w-4 ml-2" />
                      )}
                    </Button>
                  </div>
                </>
              )}

              {/* ─── Step 2: Create Avatar ────────────────── */}
              {wizardStep === 2 && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      {user?.authVideoUrl && (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      )}
                      创建数字人
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    {/* Name input */}
                    <div className="space-y-2">
                      <Label htmlFor="avatar-name">数字人名称</Label>
                      <Input
                        id="avatar-name"
                        placeholder="输入数字人名称"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="transition-colors duration-200"
                      />
                    </div>

                    {/* Training video upload area */}
                    <div className="space-y-2">
                      <Label>上传训练视频</Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/mp4,video/quicktime,video/*"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />
                      {videoFile ? (
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
                          <FileVideo className="h-8 w-8 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {videoFile.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setVideoFile(null)}
                            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 transition-colors duration-200 cursor-pointer ${
                            isDragging
                              ? "border-primary bg-primary/5"
                              : "border-muted-foreground/25 bg-muted/50 hover:border-primary/50 hover:bg-muted"
                          }`}
                        >
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium text-muted-foreground">
                            点击或拖拽上传训练视频
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            支持 MP4、MOV 格式，建议 5-60 秒
                          </p>
                        </button>
                      )}
                      {/* Training video tips */}
                      <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">拍摄要求</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>手机竖着拍</span>
                          <span>半身特写</span>
                          <span>人物居中占满画面</span>
                          <span>第一秒闭嘴</span>
                          <span>不遮挡嘴巴</span>
                          <span>正对镜头</span>
                          <span>画面中只有一个人</span>
                        </div>
                        <p className="text-xs text-amber-600">
                          请务必竖屏拍摄，横屏训练视频会导致生成的视频画面上下留黑边
                        </p>
                      </div>
                    </div>

                    {/* Error message */}
                    {submitError && (
                      <p className="text-sm text-destructive">{submitError}</p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3">
                      {cameFromStep1 && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setWizardStep(1);
                            setSubmitError(null);
                          }}
                          className="cursor-pointer"
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          上一步
                        </Button>
                      )}
                      <Button
                        onClick={handleCreateAvatar}
                        disabled={!name.trim() || !videoFile || isSubmitting}
                        className="flex-1 cursor-pointer"
                      >
                        {isSubmitting && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        {isSubmitting
                          ? submitStep === "uploading"
                            ? "上传视频中..."
                            : "创建数字人中..."
                          : "创建数字人"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Avatar grid */}
        {avatars.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <User className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                还没有数字人，创建一个吧！
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {avatars.map((avatar) => {
              const status =
                avatarStatusConfig[avatar.status] ?? avatarStatusConfig.failed;
              const linkedVoice = getLinkedVoiceForAvatar(avatar, userVoices);
              // Only show thumbnail for ready avatars — failed ones show placeholder
              const thumbnailUrl =
                avatar.status === "ready" &&
                !avatar.coverUrl &&
                avatar.thumbnailUrl
                  ? avatar.thumbnailUrl
                  : null;
              const canPreview =
                !!avatar.externalVirtualmanId &&
                linkedVoice?.status === "ready";
              const voiceStatusText =
                linkedVoice?.status === "processing"
                  ? "专属声音克隆中"
                  : linkedVoice?.status === "failed"
                    ? "专属声音克隆失败"
                    : avatar.speakerName
                      ? `绑定声音: ${avatar.speakerName}`
                      : "声音未绑定";
              return (
                <Card
                  key={avatar.id}
                  onClick={() =>
                    openPersonalAvatarPreview(avatar, thumbnailUrl)
                  }
                  className={`overflow-hidden transition-colors duration-200 group ${
                    canPreview
                      ? "hover:bg-muted/50 cursor-pointer"
                      : "cursor-default"
                  }`}
                >
                  {/* Cover image */}
                  <div className="relative aspect-square bg-muted overflow-hidden">
                    {avatar.coverUrl ? (
                      <Image
                        src={avatar.coverUrl}
                        alt={`数字人 ${avatar.name}`}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="rounded-t-lg object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : thumbnailUrl ? (
                      <Image
                        src={thumbnailUrl}
                        alt={`数字人 ${avatar.name}`}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="rounded-t-lg object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <User className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                    <Badge
                      className={`absolute top-2 right-2 border text-xs ${status.className} ${
                        status.pulse ? "animate-pulse" : ""
                      }`}
                    >
                      {status.label}
                    </Badge>
                    {/* Hover overlay hint for avatars with preview */}
                    {canPreview && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 rounded-full p-2 shadow">
                          <Play className="h-4 w-4 text-foreground" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <CardContent className="pt-3 space-y-1.5">
                    <p className="text-sm font-medium truncate">
                      {avatar.name}
                    </p>
                    {avatar.status === "failed" ? (
                      <>
                        <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-2">
                            {avatar.errorMessage || "克隆失败，请重试"}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs cursor-pointer"
                          disabled={retryingAvatarId === avatar.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryAvatar(avatar.id);
                          }}
                        >
                          {retryingAvatarId === avatar.id ? (
                            <><Loader2 className="h-3 w-3 animate-spin mr-1" />重试中...</>
                          ) : (
                            <><RotateCcw className="h-3 w-3 mr-1" />重新克隆</>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground truncate">
                          {voiceStatusText}
                        </p>
                        {linkedVoice?.status === "failed" &&
                          linkedVoice.errorMessage && (
                            <p className="text-[11px] text-destructive line-clamp-2">
                              {linkedVoice.errorMessage}
                            </p>
                          )}
                      </>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(avatar.createdAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Section 2: 公共数字人 ─────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">公共数字人</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              由平台提供的专业数字人形象，可直接使用
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {publicAvatars.map((avatar) => (
            <Card
              key={avatar.id}
              onClick={() => openPublicAvatarPreview(avatar)}
              className="overflow-hidden transition-colors duration-200 hover:bg-muted/50 cursor-pointer group"
            >
              {/* Cover image */}
              <div className="relative aspect-square bg-muted overflow-hidden">
                {avatar.coverUrl ? (
                  <Image
                    src={avatar.coverUrl}
                    alt={`公共数字人 ${avatar.name}`}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="rounded-t-lg object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <User className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                )}
                <Badge className="absolute top-2 left-2 border text-xs bg-blue-100 text-blue-700 border-blue-200">
                  公共
                </Badge>
                {/* Hover overlay hint */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 rounded-full p-2 shadow">
                    <Play className="h-4 w-4 text-foreground" />
                  </div>
                </div>
              </div>

              {/* Info */}
              <CardContent className="pt-3 space-y-1.5">
                <p className="text-sm font-medium truncate">{avatar.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {avatar.gender || "通用形象"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {personalPreviewSelection && (
        <PublicAvatarPreviewDialog
          key={personalPreviewSelection.avatar.id}
          open={personalPreviewSelection !== null}
          onOpenChange={(open) => {
            if (!open) setPersonalPreviewSelection(null);
          }}
          avatar={personalPreviewSelection.avatar}
          voices={personalPreviewSelection.voices}
          defaultText="你好，我想用 10 秒告诉你，这个数字人和哪种营销表达更匹配。"
          selectedVoiceId={selectedPersonalVoiceId}
          onSelectedVoiceChange={setSelectedPersonalVoiceId}
        />
      )}

      {publicPreviewAvatar && (
        <PublicAvatarPreviewDialog
          key={publicPreviewAvatar.id}
          open={publicPreviewAvatar !== null}
          onOpenChange={(open) => {
            if (!open) setPublicPreviewAvatar(null);
          }}
          avatar={publicPreviewAvatar}
          voices={publicVoices}
          defaultText="你好，我想用 10 秒告诉你，这个数字人和哪种营销表达更匹配。"
          selectedVoiceId={selectedPublicVoiceId}
          onSelectedVoiceChange={setSelectedPublicVoiceId}
        />
      )}
    </div>
  );
}

// ─── Assets Tab ─────────────────────────────────────────

function AssetsTab({
  assets,
  loading,
  onRefresh,
  publicVoices,
  userVoices,
}: {
  assets: ApiAsset[];
  loading: boolean;
  onRefresh: () => void;
  publicVoices: PublicVoice[];
  userVoices: UserVoice[];
}) {
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("image");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const publicVoicesScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nonVoiceAssets = assets.filter((asset) => asset.assetType !== "voice");
  const filteredAssets =
    filter === "all"
      ? nonVoiceAssets
      : nonVoiceAssets.filter((asset) => asset.assetType === filter);

  function handleVoicePreview(voice: { id: string; demoUrl?: string }) {
    if (!voice.demoUrl || voice.demoUrl === "#" || voice.demoUrl === "") return;

    // If this voice is already playing, pause it
    if (playingVoiceId === voice.id) {
      audioRef.current?.pause();
      setPlayingVoiceId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    // Create and play new audio
    const audio = new Audio(voice.demoUrl);
    audioRef.current = audio;
    setPlayingVoiceId(voice.id);

    audio.play().catch(() => {
      // Playback failed (e.g., network issue or invalid URL)
      setPlayingVoiceId(null);
    });

    audio.addEventListener("ended", () => {
      setPlayingVoiceId(null);
    });

    audio.addEventListener("error", () => {
      setPlayingVoiceId(null);
    });
  }

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const el = publicVoicesScrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (el!.scrollWidth <= el!.clientWidth) return;
      // Trackpad horizontal swipe → use deltaX; mouse wheel → convert deltaY
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      el!.scrollLeft += delta;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function resetUploadForm() {
    setName("");
    setAssetType("image");
    setAssetFile(null);
    setSubmitError(null);
    setIsDragging(false);
  }

  function matchesAssetType(file: File, type: AssetType) {
    if (type === "image") return file.type.startsWith("image/");
    if (type === "video") return file.type.startsWith("video/");
    if (type === "music") return file.type.startsWith("audio/");
    return false;
  }

  function handleFileSelect(file: File) {
    if (!matchesAssetType(file, assetType)) {
      setSubmitError(`所选文件与「${assetTypeConfig[assetType].label}」类型不匹配`);
      return;
    }
    setAssetFile(file);
    setSubmitError(null);
    if (!name.trim()) {
      const fallbackName = file.name.replace(/\.[^.]+$/, "");
      setName(fallbackName);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  async function handleUploadAsset() {
    if (!name.trim() || !assetFile) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const assetUrl = await uploadFileToStorage(assetFile);
      await registerAsset({
        name: name.trim(),
        assetType,
        url: assetUrl,
        size: assetFile.size,
      });
      setDialogOpen(false);
      resetUploadForm();
      onRefresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return <AssetsSkeleton />;
  }

  return (
    <div className="space-y-10">
      {/* ─── Section: 我的声音 ──────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">我的声音</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              数字人克隆生成的专属声音资产，会默认复用到你的数字人上
            </p>
          </div>
        </div>

        {userVoices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Volume2 className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">还没有专属声音</p>
              <p className="text-sm text-muted-foreground mt-1">
                创建数字人后，系统会把克隆出的声音自动沉淀到这里
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {userVoices.map((voice) => {
              const isPlaying = playingVoiceId === voice.id;
              const hasDemo =
                !!voice.demoUrl &&
                voice.demoUrl !== "#" &&
                voice.demoUrl !== "";
              const status = voice.status ?? "ready";
              const statusLabel =
                status === "ready"
                  ? "可复用"
                  : status === "processing"
                    ? "克隆中"
                    : "失败";

              return (
                <Card
                  key={voice.assetId ?? voice.id}
                  onClick={() => {
                    if (hasDemo && status === "ready") {
                      handleVoicePreview(voice);
                    }
                  }}
                  className={`transition-colors duration-200 ${
                    hasDemo && status === "ready"
                      ? "hover:bg-muted/50 cursor-pointer"
                      : "cursor-default"
                  } ${isPlaying ? "ring-2 ring-primary bg-primary/5" : ""}`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ${
                          isPlaying
                            ? "bg-primary text-primary-foreground"
                            : "bg-primary/10"
                        }`}
                      >
                        {isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <Badge
                        variant={
                          status === "ready"
                            ? "secondary"
                            : status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                        className="shrink-0"
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium truncate">
                        {voice.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {status === "ready"
                          ? hasDemo
                            ? "可试听，也会默认用于对应数字人"
                            : "已可复用，会默认用于对应数字人"
                          : status === "processing"
                            ? "声音资源生成中，完成后会自动可用"
                            : voice.errorMessage || "声音生成失败，请重新克隆"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Section: 公共声音素材 ──────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">公共声音</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              平台提供的声音素材，可在创建视频时选用
            </p>
          </div>
        </div>

        <div
          ref={publicVoicesScrollRef}
          className="flex gap-3 overflow-x-auto pb-2"
        >
          {publicVoices.map((voice) => {
            const isPlaying = playingVoiceId === voice.id;
            const hasDemo =
              !!voice.demoUrl && voice.demoUrl !== "#" && voice.demoUrl !== "";
            return (
              <Card
                key={voice.id}
                onClick={() => handleVoicePreview(voice)}
                className={`min-w-[160px] max-w-[180px] shrink-0 overflow-hidden transition-colors duration-200 ${
                  hasDemo
                    ? "hover:bg-muted/50 cursor-pointer"
                    : "opacity-60 cursor-default"
                } ${isPlaying ? "ring-2 ring-primary bg-primary/5" : ""}`}
              >
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ${
                        isPlaying
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10"
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    {hasDemo && (
                      <Badge
                        variant={isPlaying ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0 h-5"
                      >
                        {isPlaying ? "播放中" : "试听"}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium truncate">{voice.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {voice.gender || "通用"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ─── Section: 我的素材 ──────────────────────────── */}
      <section className="space-y-6">
        {/* Filter row + Upload button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Filter buttons */}
          <div className="flex items-center gap-2">
            {assetFilters.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f.value)}
                className="cursor-pointer transition-colors duration-200"
              >
                {f.label}
              </Button>
            ))}
          </div>

          {/* Upload dialog */}
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetUploadForm();
            }}
          >
            <DialogTrigger
              render={
                <Button className="cursor-pointer transition-colors duration-200" />
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              上传素材
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>上传素材</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Name input */}
                <div className="space-y-2">
                  <Label htmlFor="asset-name">素材名称</Label>
                  <Input
                    id="asset-name"
                    placeholder="输入素材名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="transition-colors duration-200"
                  />
                </div>

                {/* Type select */}
                <div className="space-y-2">
                  <Label htmlFor="asset-type">素材类型</Label>
                  <Select
                    value={assetType}
                    onValueChange={(v) => setAssetType(v as AssetType)}
                  >
                    <SelectTrigger id="asset-type" className="cursor-pointer">
                      <SelectValue placeholder="选择素材类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image" className="cursor-pointer">
                        图片
                      </SelectItem>
                      <SelectItem value="video" className="cursor-pointer">
                        视频
                      </SelectItem>
                      <SelectItem value="music" className="cursor-pointer">
                        音乐
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Upload area */}
                <div className="space-y-2">
                  <Label>上传文件</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={
                      assetType === "image"
                        ? "image/*"
                        : assetType === "video"
                          ? "video/*"
                          : "audio/*"
                    }
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                  {assetFile ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
                      <Upload className="h-8 w-8 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{assetFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(assetFile.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAssetFile(null)}
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 transition-colors duration-200 cursor-pointer ${
                        isDragging
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 bg-muted/50 hover:border-primary/50 hover:bg-muted"
                      }`}
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">
                        点击或拖拽上传文件
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        当前类型：{assetTypeConfig[assetType].label}
                      </p>
                    </button>
                  )}
                </div>

                {submitError && (
                  <p className="text-sm text-destructive">{submitError}</p>
                )}

                <Button
                  onClick={handleUploadAsset}
                  disabled={!name.trim() || !assetFile || isSubmitting}
                  className="w-full cursor-pointer"
                >
                  {isSubmitting && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {isSubmitting ? "上传中..." : "确认上传"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Asset grid */}
        {filteredAssets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {filter === "all"
                  ? "还没有素材，上传一个吧！"
                  : `没有${assetFilters.find((f) => f.value === filter)?.label ?? ""}类型的素材`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredAssets.map((asset) => {
              const typeConfig = assetTypeConfig[asset.assetType];
              const TypeIcon = typeConfig?.icon ?? ImageIcon;
              return (
                <Card
                  key={asset.id}
                  className="overflow-hidden transition-colors duration-200 hover:bg-muted/50 cursor-pointer"
                >
                  {/* Preview */}
                  <div className="relative aspect-video bg-muted overflow-hidden">
                    {asset.assetType === "image" && asset.url ? (
                      <Image
                        src={asset.url}
                        alt={asset.name}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <TypeIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <CardContent className="pt-3 space-y-1.5">
                    <p className="text-sm font-medium truncate">{asset.name}</p>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        {typeConfig?.label ?? asset.assetType}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(asset.createdAt)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Skeleton Loaders ───────────────────────────────────

function AvatarsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-square w-full" />
            <CardContent className="pt-3 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AssetsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-14" />
          ))}
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <CardContent className="pt-3 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <div className="flex justify-between">
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
