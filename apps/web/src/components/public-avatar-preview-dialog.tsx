"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Pause, Play, Sparkles, Volume2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPublicAvatarPreview,
  getPublicAvatarPreview,
  getPublicAvatarPreviewDefaults,
} from "@/lib/api/client";
import type { ApiPublicAvatarPreview } from "@/types/api";

const MIN_PREVIEW_TEXT_LENGTH = 6;
const MAX_PREVIEW_TEXT_LENGTH = 80;
const SLOW_PREVIEW_HINT_DELAY = 20000;
const PRESET_TEXTS = [
  "你好，我来用一句话告诉你，这个方案为什么更适合你。",
  "今天用 10 秒讲清楚，我们这项服务到底能帮你解决什么问题。",
  "如果你也在做个人 IP，这条建议能帮你少走很多弯路。",
];

export interface PreviewablePublicAvatar {
  id: string;
  name: string;
  coverUrl: string;
  gender?: string;
  previewVirtualmanId?: string;
  source?: "public" | "mine";
}

export interface PreviewablePublicVoice {
  id: string;
  name: string;
  gender?: string;
  coverUrl?: string;
  demoUrl?: string;
  langs?: string[];
}

interface PublicAvatarPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatar: PreviewablePublicAvatar | null;
  voices: PreviewablePublicVoice[];
  defaultText: string;
  selectedVoiceId: string | null;
  onSelectedVoiceChange: (voiceId: string) => void;
  applyLabel?: string;
  onApply?: () => void;
}

export function PublicAvatarPreviewDialog({
  open,
  onOpenChange,
  avatar,
  voices,
  defaultText,
  selectedVoiceId,
  onSelectedVoiceChange,
  applyLabel,
  onApply,
}: PublicAvatarPreviewDialogProps) {
  const [draftText, setDraftText] = useState(defaultText);
  const [preview, setPreview] = useState<ApiPublicAvatarPreview | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHydratingDefaults, setIsHydratingDefaults] = useState(false);
  const [defaultsLoadError, setDefaultsLoadError] = useState<string | null>(
    null,
  );
  const [defaultsLoadVersion, setDefaultsLoadVersion] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showBackgroundHint, setShowBackgroundHint] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const avatarSource = avatar?.source ?? "public";
  const previewVirtualmanId = avatar?.previewVirtualmanId ?? avatar?.id ?? null;
  const resolvedVoiceId = useMemo(() => {
    if (
      selectedVoiceId &&
      voices.some((voice) => voice.id === selectedVoiceId)
    ) {
      return selectedVoiceId;
    }
    return voices[0]?.id ?? null;
  }, [selectedVoiceId, voices]);
  const normalizedDraftText = draftText.trim();

  const currentVoice = useMemo(
    () => voices.find((voice) => voice.id === resolvedVoiceId) ?? null,
    [resolvedVoiceId, voices],
  );

  const hasLoadedCachedPreview =
    preview?.status === "succeed" && !!preview.videoUrl && preview.cached;

  const hasPreviewConfigChanged =
    !preview ||
    preview.speakerId !== resolvedVoiceId ||
    preview.text !== normalizedDraftText;

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!open || !avatar || !previewVirtualmanId) return;

    let cancelled = false;
    void (async () => {
      setIsHydratingDefaults(true);
      setDefaultsLoadError(null);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const defaults =
            await getPublicAvatarPreviewDefaults(previewVirtualmanId);
          if (cancelled) return;

          if (
            avatarSource !== "mine" &&
            defaults.speakerId &&
            voices.some((voice) => voice.id === defaults.speakerId)
          ) {
            onSelectedVoiceChange(defaults.speakerId);
          }
          if (defaults.text) {
            setDraftText(defaults.text);
          }
          if (
            defaults.preview &&
            (avatarSource !== "mine" ||
              !resolvedVoiceId ||
              defaults.preview.speakerId === resolvedVoiceId)
          ) {
            setPreview(defaults.preview);
            setIsSubmitting(defaults.preview.status === "processing");
            setShowBackgroundHint(false);
          }
          setIsHydratingDefaults(false);
          return;
        } catch {
          if (cancelled) return;
          if (attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 600));
            continue;
          }
        }
      }

      setDefaultsLoadError(
        "未能加载上次试看，你可以重新加载，或直接重新生成。",
      );
      setIsHydratingDefaults(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    avatar,
    avatarSource,
    defaultsLoadVersion,
    onSelectedVoiceChange,
    open,
    previewVirtualmanId,
    resolvedVoiceId,
    voices,
  ]);

  useEffect(() => {
    if (!open || !preview?.taskId || preview.status !== "processing") return;

    let cancelled = false;
    let timer: number | null = null;

    const scheduleNextPoll = () => {
      if (cancelled) return;
      timer = window.setTimeout(poll, 3000);
    };

    const poll = async () => {
      try {
        const next = await getPublicAvatarPreview(preview.taskId);
        if (cancelled) return;
        setPreview(next);
        if (next.status !== "processing") {
          setIsSubmitting(false);
          return;
        }
        scheduleNextPoll();
      } catch (error) {
        if (cancelled) return;
        setPreviewError(
          error instanceof Error ? error.message : "试看查询失败，请稍后重试",
        );
        setIsSubmitting(false);
      }
    };

    scheduleNextPoll();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [open, preview?.taskId, preview?.status]);

  useEffect(() => {
    if (!open || preview?.status !== "processing") return;

    const timer = window.setTimeout(() => {
      setShowBackgroundHint(true);
    }, SLOW_PREVIEW_HINT_DELAY);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, preview?.status, preview?.taskId]);

  const handleVoicePreview = useCallback(
    (voice: PreviewablePublicVoice) => {
      if (!voice.demoUrl || voice.demoUrl === "#" || voice.demoUrl === "")
        return;

      if (playingVoiceId === voice.id) {
        audioRef.current?.pause();
        setPlayingVoiceId(null);
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }

      const audio = new Audio(voice.demoUrl);
      audioRef.current = audio;
      setPlayingVoiceId(voice.id);

      audio.play().catch(() => {
        setPlayingVoiceId(null);
      });

      audio.addEventListener("ended", () => {
        setPlayingVoiceId(null);
      });

      audio.addEventListener("error", () => {
        setPlayingVoiceId(null);
      });
    },
    [playingVoiceId],
  );

  async function handleGeneratePreview() {
    if (!avatar || !previewVirtualmanId) {
      setPreviewError("这个数字人还没准备好，暂时不能生成试看");
      return;
    }

    if (!resolvedVoiceId) {
      setPreviewError("请先选择一个声音");
      return;
    }

    const normalizedText = normalizedDraftText;
    if (
      normalizedText.length < MIN_PREVIEW_TEXT_LENGTH ||
      normalizedText.length > MAX_PREVIEW_TEXT_LENGTH
    ) {
      setPreviewError(
        `试看文案需控制在 ${MIN_PREVIEW_TEXT_LENGTH}-${MAX_PREVIEW_TEXT_LENGTH} 个字符之间`,
      );
      return;
    }

    setIsSubmitting(true);
    setPreviewError(null);
    setShowBackgroundHint(false);
    setPreview({
      taskId: "",
      status: "processing",
      videoUrl: null,
      coverUrl: null,
      duration: null,
      errorCode: null,
      errorMessage: null,
      speakerId: resolvedVoiceId,
      text: normalizedText,
      cached: false,
    });

    try {
      const task = await createPublicAvatarPreview({
        virtualmanId: previewVirtualmanId,
        speakerId: resolvedVoiceId,
        text: normalizedText,
      });

      setPreview(task);
      setIsSubmitting(task.status === "processing");
      setPreviewError(task.status === "failed" ? task.errorMessage : null);
      if (task.status !== "processing") {
        setShowBackgroundHint(false);
      }
    } catch (error) {
      setPreview(null);
      setPreviewError(
        error instanceof Error ? error.message : "试看生成失败，请稍后重试",
      );
      setIsSubmitting(false);
      setShowBackgroundHint(false);
    }
  }

  const previewMessage =
    preview?.cached && preview?.status === "succeed"
      ? "已为你加载上次成功生成的试看。文案和声音不变时，不会重复生成。"
      : preview?.status === "processing"
        ? showBackgroundHint
          ? "后台继续处理中。你可以先去选别的数字人，稍后回来会自动显示结果。"
          : "正在生成 8-10 秒口播试看，通常 1-3 分钟返回，高峰期可能更久。"
        : preview?.status === "failed"
          ? preview.errorMessage || "试看生成失败，请换一段更短的文案再试。"
          : hasLoadedCachedPreview
            ? "已加载上次生成过的试看，点左侧播放即可查看。文案和声音不变时，不需要重新生成。"
            : "先听声音，再看人声组合。这里的试看只用于判断形象和声线是否匹配。";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{avatar?.name ?? "数字人试看"}</DialogTitle>
          <DialogDescription>
            {avatarSource === "mine"
              ? "你的数字人会默认带入已绑定声音，你也可以切换别的声线。先用一句核心表达，看看这个形象讲出来是不是对味。"
              : "公共数字人只提供形象，声音可自由切换。先用一句你的核心表达，看看这个形象讲出来是不是对味。"}
          </DialogDescription>
        </DialogHeader>

        {avatar && (
          <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border bg-muted">
                {preview?.status === "succeed" && preview.videoUrl ? (
                  <video
                    key={preview.videoUrl}
                    ref={videoRef}
                    src={preview.videoUrl}
                    poster={preview.coverUrl ?? avatar.coverUrl}
                    controls
                    playsInline
                    className="aspect-[4/5] w-full object-cover"
                  />
                ) : avatar.coverUrl ? (
                  <Image
                    src={avatar.coverUrl}
                    alt={avatar.name}
                    width={440}
                    height={550}
                    unoptimized
                    className="aspect-[4/5] w-full object-cover"
                  />
                ) : (
                  <div className="aspect-[4/5] w-full bg-muted" />
                )}
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {avatarSource === "mine"
                      ? "专属形象"
                      : avatar.gender || "通用形象"}
                  </Badge>
                  {currentVoice && (
                    <Badge variant="outline">{currentVoice.name}</Badge>
                  )}
                  {preview?.status === "processing" && showBackgroundHint && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 text-amber-700"
                    >
                      后台处理中
                    </Badge>
                  )}
                  {preview?.status === "succeed" && (
                    <Badge
                      variant="outline"
                      className="border-emerald-200 text-emerald-700"
                    >
                      已可播放
                    </Badge>
                  )}
                </div>
                <p className="mt-2 leading-relaxed">{previewMessage}</p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="public-avatar-preview-text">试看文案</Label>
                  <span className="text-xs text-muted-foreground">
                    {draftText.trim().length}/{MAX_PREVIEW_TEXT_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="public-avatar-preview-text"
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  rows={5}
                  placeholder={
                    avatarSource === "mine"
                      ? "输入一句你想让这个数字人说的话"
                      : "输入一句你想让这个公共数字人说的话"
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {PRESET_TEXTS.map((text) => (
                    <Button
                      key={text}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => setDraftText(text)}
                    >
                      {text.length > 18 ? `${text.slice(0, 18)}...` : text}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>声音</Label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Select
                    value={resolvedVoiceId ?? undefined}
                    onValueChange={(value) => {
                      if (value) onSelectedVoiceChange(value);
                    }}
                  >
                    <SelectTrigger className="cursor-pointer sm:flex-1">
                      <SelectValue placeholder="选择一个声音">
                        {currentVoice
                          ? `${currentVoice.name}${currentVoice.gender ? ` · ${currentVoice.gender}` : ""}`
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name}
                          {voice.gender ? ` · ${voice.gender}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      currentVoice && handleVoicePreview(currentVoice)
                    }
                    disabled={
                      !currentVoice?.demoUrl || currentVoice.demoUrl === "#"
                    }
                    className="cursor-pointer gap-2"
                  >
                    {playingVoiceId === currentVoice?.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    试听声音
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  先听声线，再生成口播试看。最终正式视频将沿用你当前选中的声音。
                </p>
              </div>

              {previewError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {previewError}
                </div>
              )}

              {isHydratingDefaults && !preview && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  正在读取你上次生成过的试看配置...
                </div>
              )}

              {defaultsLoadError && !preview && (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                  <span>{defaultsLoadError}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefaultsLoadVersion((value) => value + 1)}
                    className="cursor-pointer text-amber-900 hover:text-amber-900"
                  >
                    重新加载上次试看
                  </Button>
                </div>
              )}

              {preview?.status === "failed" &&
                preview.errorMessage &&
                !previewError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {preview.errorMessage}
                  </div>
                )}

              {hasLoadedCachedPreview && !hasPreviewConfigChanged && (
                <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    已直接载入你上次生成过的试看，点左侧播放即可查看。
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      videoRef.current?.play().catch(() => {});
                    }}
                    className="cursor-pointer text-emerald-900 hover:text-emerald-900"
                  >
                    播放上次试看
                  </Button>
                </div>
              )}

              {preview?.status === "processing" && showBackgroundHint && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  后台会继续生成，关闭弹窗不会中断处理。你稍后再回来时，如果结果已经完成，会自动直接显示。
                </div>
              )}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={handleGeneratePreview}
                  disabled={
                    !resolvedVoiceId ||
                    isSubmitting ||
                    (hasLoadedCachedPreview && !hasPreviewConfigChanged)
                  }
                  className="cursor-pointer gap-2"
                  variant={
                    hasLoadedCachedPreview && !hasPreviewConfigChanged
                      ? "outline"
                      : undefined
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {showBackgroundHint ? "后台处理中，可先离开" : "处理中"}
                    </>
                  ) : hasLoadedCachedPreview && !hasPreviewConfigChanged ? (
                    <>
                      <Check className="h-4 w-4" />
                      已加载上次试看
                    </>
                  ) : hasLoadedCachedPreview ? (
                    <>
                      <Sparkles className="h-4 w-4" />
                      生成新的试看
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      生成口播试看
                    </>
                  )}
                </Button>
                {onApply && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onApply}
                    className="cursor-pointer gap-2"
                  >
                    <Check className="h-4 w-4" />
                    {applyLabel ?? "选用这个数字人"}
                  </Button>
                )}
                {preview?.status === "processing" && showBackgroundHint && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onOpenChange(false)}
                    className="cursor-pointer"
                  >
                    先去选别的数字人
                  </Button>
                )}
              </div>

              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>
                    这不是正式出片，只是帮你确认“这张脸 + 这条声线 +
                    这句文案”是否匹配。
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
