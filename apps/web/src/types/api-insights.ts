import type { ApiUser } from "./api-core";

export interface ApiAiHotBriefingItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string | null;
  timeText: string;
  summary: string;
  url: string;
  category: "ai-models" | "ai-products" | "industry" | "paper" | "tip" | "creator" | "client-industry";
  categoryLabel: string;
}

export interface ApiAiHotBriefingAccount {
  email: string;
  label: string;
  selected: boolean;
  sourceCount: number;
}

export interface ApiAiHotBriefingSource {
  source_name: string;
  source_url: string;
  source_type?: string;
  status?: string;
  note?: string;
}

export interface ApiAccountHotSources {
  accountEmail: string;
  sourceCount: number;
  sources: ApiAiHotBriefingSource[];
}

export interface ApiAiHotBriefing {
  title: string;
  date: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  markdown: string;
  audience?: "self_media" | "client_industry";
  accountEmail?: string;
  accounts?: ApiAiHotBriefingAccount[];
  sources?: ApiAiHotBriefingSource[];
  projectId?: string;
  projectName?: string;
  items: ApiAiHotBriefingItem[];
}

export interface ApiMarketHotItem {
  id: string;
  platform: string;
  title: string;
  excerpt: string;
  url: string;
  author: string;
  date: string;
  score: number;
  engagement?: {
    likes?: number;
    num_comments?: number;
  };
}

export interface ApiMarketHotSnapshot {
  date: string;
  generatedAt: string | null;
  items: ApiMarketHotItem[];
  warnings: string[];
  summary: string;
  status: "success" | "partial" | "failed" | "empty";
}

export type ApiHotDecisionSource = "market" | "aihot";
export type ApiHotDecisionItemSource = ApiHotDecisionSource | "last30days" | "douyin";
export type ApiHotDecisionVerdict = "worth" | "watch" | "caution" | "avoid";
export type ApiHotSourceTier = "selected" | "strong" | "medium" | "weak";

export interface ApiHotDecisionItem {
  id: string;
  source: ApiHotDecisionItemSource;
  title: string;
  summary: string;
  url: string;
  platform: string;
  sourceName: string;
  publishedAt: string | null;
  score: number;
  verdict: ApiHotDecisionVerdict;
  verdictLabel: string;
  sourceTier: ApiHotSourceTier;
  sourceTierLabel: string;
  sourceConfidence: string;
  reason: string;
  recommendedAction: string;
  isPreselected: boolean;
  clusterSize: number;
  relatedTitles: string[];
}

export interface ApiHotDecisionResponse {
  source: ApiHotDecisionSource;
  updatedAt: string | null;
  items: ApiHotDecisionItem[];
  warnings: string[];
  summary: string;
}

export interface ApiVideoCopyAnalysis {
  /** 纯 Markdown 格式的四维拆解（结构拆解 + 心理拆解 + 商业拆解 + 迁移应用） */
  markdown: string;
}

export interface ApiVideoCopyExtraction {
  id: string;
  sourceUrl: string;
  platform: string;
  status: "queued" | "extracting" | "analyzing" | "completed" | "failed" | string;
  errorMessage: string | null;
  analysisError: string | null;
  videoTitle: string | null;
  videoCover: string | null;
  videoDuration: string | null;
  transcript: string | null;
  analysisResult: ApiVideoCopyAnalysis | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ApiHotTopicSource {
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface ApiHotTopicInsight {
  topicId: string;
  title: string;
  summary: string;
  whyTrending: string;
  keyFacts: string[];
  marketingThemes: string[];
  riskLevel: "low" | "medium" | "high";
  caution: string[];
  notRecommendedAngles: string[];
  freshness: "fresh" | "stale" | "outdated";
  freshnessNote: string;
  sourceLinks: ApiHotTopicSource[];
  evidenceQuality: "strong" | "medium" | "weak";
  analyzedAt: string;
}

export interface ApiHotTopicFit {
  topicId: string;
  title: string;
  score: number;
  verdict: "strong" | "caution" | "avoid";
  fitSummary: string;
  bridgeReason: string;
  recommendedAngle: string;
  recommendedHook: string;
  ctaDirection: string;
  caution: string[];
  evaluatedAt: string;
}

export interface AuthResponse {
  user: ApiUser;
}

export interface ApiPublicAvatarPreview {
  taskId: string;
  status: "processing" | "succeed" | "failed";
  videoUrl: string | null;
  coverUrl: string | null;
  duration: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  speakerId: string;
  text: string;
  cached: boolean;
}

export interface ApiPublicAvatarPreviewDefaults {
  text: string | null;
  speakerId: string | null;
  preview: ApiPublicAvatarPreview | null;
}

export interface ApiPublicVirtualman {
  id: string;
  name: string;
  gender?: string;
  coverUrl?: string;
}

export interface ApiPublicAssetVoice {
  id: string;
  name: string;
  gender?: string;
  coverUrl?: string;
  demoUrl?: string;
  langs?: string[];
}

// ─── Three-Layer Video Creation Types ────────────────────
