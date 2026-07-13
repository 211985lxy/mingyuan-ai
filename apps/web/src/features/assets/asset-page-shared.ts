import { Film, Image as ImageIcon, Music } from "lucide-react";

import { getPublicAssets } from "@/lib/api/client";
import type { ApiAsset, ApiAvatar } from "@/types/api";

// ─── Constants ──────────────────────────────────────────

export const avatarStatusConfig: Record<
  string,
  { label: string; className: string; pulse?: boolean }
> = {
  ready: {
    label: "就绪",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  cloning: {
    label: "克隆中",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    pulse: true,
  },
  failed: {
    label: "失败",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  uploading: {
    label: "上传中",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
};

export const assetTypeConfig: Record<
  string,
  { label: string; icon: typeof ImageIcon }
> = {
  image: { label: "图片", icon: ImageIcon },
  video: { label: "视频", icon: Film },
  music: { label: "音乐", icon: Music },
};

export type AssetType = "image" | "video" | "music";
export type AssetFilter = "all" | AssetType;

export const assetFilters: { value: AssetFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "music", label: "音乐" },
];

export const ASSET_FLOW_CARDS = [
  {
    title: "企业资料",
    desc: "营业资料、项目介绍、产品手册先沉淀到资产库。",
  },
  {
    title: "证据素材",
    desc: "案例图片、过程视频、客户反馈作为文案的可信证据。",
  },
  {
    title: "声音资产",
    desc: "克隆声音和公共声音沉淀为可复用表达资产。",
  },
  {
    title: "成片包装",
    desc: "创作页会围绕最终文案调用素材和包装能力。",
  },
] as const;

// ─── Public asset types ─────────────────────────────────

export interface PublicAvatar {
  id: string;
  name: string;
  coverUrl: string;
  gender?: string;
}

export interface PublicVoice {
  id: string;
  name: string;
  gender?: string;
  coverUrl?: string;
  demoUrl?: string;
  langs?: string[];
}

export interface UserVoice {
  assetId?: string;
  id: string;
  sourceAvatarId?: string;
  name: string;
  demoUrl?: string;
  status?: ApiAsset["status"];
  errorMessage?: string;
}

export interface AvatarPreviewVoice extends PublicVoice {
  source: "public" | "mine";
}

export interface AvatarPreviewSelection {
  avatar: {
    id: string;
    name: string;
    coverUrl: string;
    gender?: string;
    previewVirtualmanId?: string;
    source: "public" | "mine";
  };
  voices: AvatarPreviewVoice[];
}

export async function fetchPublicAssets(): Promise<{
  avatars: PublicAvatar[];
  voices: PublicVoice[];
}> {
  try {
    const data = await getPublicAssets();
    const avatars = data.virtualmen.map((v) => ({
      id: v.id,
      name: v.name,
      coverUrl: v.coverUrl || "",
      gender: v.gender,
    }));
    const voices = data.voices.map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      coverUrl: v.coverUrl,
      demoUrl: v.demoUrl,
      langs: v.langs,
    }));
    return { avatars, voices };
  } catch {
    return { avatars: [], voices: [] };
  }
}

export function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function buildUserVoicesFromAssets(assets: ApiAsset[]): UserVoice[] {
  return assets
    .filter((asset) => asset.assetType === "voice")
    .map((asset) => ({
      assetId: asset.id,
      id: asset.externalSpeakerId || asset.id,
      sourceAvatarId: asset.sourceAvatarId ?? undefined,
      name: asset.name,
      demoUrl: asset.demoAudioUrl ?? undefined,
      status: asset.status,
      errorMessage: asset.errorMessage ?? undefined,
    }));
}

export function getLinkedVoiceForAvatar(
  avatar: ApiAvatar,
  userVoices: UserVoice[],
): UserVoice | undefined {
  return (
    userVoices.find((voice) => voice.sourceAvatarId === avatar.id) ||
    (avatar.externalSpeakerId
      ? userVoices.find((voice) => voice.id === avatar.externalSpeakerId)
      : undefined) ||
    (avatar.speakerName
      ? userVoices.find((voice) => voice.name === avatar.speakerName)
      : undefined)
  );
}

export function getRecommendedVoiceId(
  voices: PublicVoice[],
  gender?: string,
): string | null {
  if (voices.length === 0) return null;
  const matched = gender
    ? voices.find((voice) => voice.gender === gender)
    : null;
  return matched?.id ?? voices[0].id;
}

export function dedupeVoices(voices: AvatarPreviewVoice[]): AvatarPreviewVoice[] {
  const seen = new Set<string>();
  return voices.filter((voice) => {
    if (seen.has(voice.id)) return false;
    seen.add(voice.id);
    return true;
  });
}

export function buildPersonalAvatarVoices(
  avatar: ApiAvatar,
  userVoices: UserVoice[],
  publicVoices: PublicVoice[],
): AvatarPreviewVoice[] {
  const combined: AvatarPreviewVoice[] = [];

  if (avatar.externalSpeakerId) {
    const matchedUserVoice = userVoices.find(
      (voice) => voice.id === avatar.externalSpeakerId,
    );
    const matchedPublicVoice = publicVoices.find(
      (voice) => voice.id === avatar.externalSpeakerId,
    );

    combined.push({
      id: avatar.externalSpeakerId,
      name:
        matchedUserVoice?.name ||
        matchedPublicVoice?.name ||
        avatar.speakerName ||
        "我的声音",
      gender: matchedPublicVoice?.gender,
      coverUrl: matchedPublicVoice?.coverUrl,
      demoUrl: matchedUserVoice?.demoUrl || matchedPublicVoice?.demoUrl,
      langs: matchedPublicVoice?.langs,
      source: "mine",
    });
  }

  combined.push(
    ...userVoices
      .filter((voice) => voice.status === "ready" && voice.id !== voice.assetId)
      .map((voice) => ({
        id: voice.id,
        name: voice.name,
        demoUrl: voice.demoUrl,
        source: "mine" as const,
      })),
    ...publicVoices.map((voice) => ({
      ...voice,
      source: "public" as const,
    })),
  );

  return dedupeVoices(combined);
}

export function getDefaultVoiceIdForPersonalAvatar(
  avatar: ApiAvatar,
  voices: AvatarPreviewVoice[],
): string | null {
  if (
    avatar.externalSpeakerId &&
    voices.some((voice) => voice.id === avatar.externalSpeakerId)
  ) {
    return avatar.externalSpeakerId;
  }

  if (avatar.speakerName) {
    const matched = voices.find((voice) => voice.name === avatar.speakerName);
    if (matched) return matched.id;
  }

  const personalVoice = voices.find((voice) => voice.source === "mine");
  return personalVoice?.id ?? voices[0]?.id ?? null;
}
