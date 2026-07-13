import { Film, Image as ImageIcon, Music } from "lucide-react";

import { getPublicAssets } from "@/lib/api/client";
import type { ApiAsset } from "@/types/api";

// ─── Constants ──────────────────────────────────────────

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
    desc: "自有声音和公共声音沉淀为可复用表达资产。",
  },
  {
    title: "成片包装",
    desc: "创作页会围绕最终文案调用素材和包装能力。",
  },
] as const;

// ─── Public asset types ─────────────────────────────────

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

export async function fetchPublicVoices(): Promise<PublicVoice[]> {
  try {
    const data = await getPublicAssets();
    return data.voices.map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      coverUrl: v.coverUrl,
      demoUrl: v.demoUrl,
      langs: v.langs,
    }));
  } catch {
    return [];
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
