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
    title: "数字人分身",
    desc: "上传授权视频和本人素材，克隆出可口播的数字人。",
  },
  {
    title: "证据素材",
    desc: "案例图片、过程视频、客户反馈作为文案的可信证据。",
  },
  {
    title: "作品出片",
    desc: "作品编辑成稿后，选数字人即可生成口播视频。",
  },
] as const;


/**
 * @description 格式化date
 * @param dateStr - 日期Str
 * @returns 无返回值
 */
export function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
