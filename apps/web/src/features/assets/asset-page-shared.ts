import { Film, Image as ImageIcon, Music } from "lucide-react";

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
    title: "成片包装",
    desc: "创作页会围绕最终文案调用素材和包装能力。",
  },
] as const;


export function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
