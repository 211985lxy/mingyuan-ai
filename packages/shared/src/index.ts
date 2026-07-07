export interface User {
  id: string;
  email: string;
  name: string;
  dailyLimit: number;
  videosCreatedToday: number;
  createdAt: string;
}

export type AvatarStatus = "uploading" | "cloning" | "ready" | "failed";

export interface Avatar {
  id: string;
  userId: string;
  name: string;
  status: AvatarStatus;
  coverUrl: string;
  sourceVideoUrl: string;
  previewUrl: string;
  thumbnailUrl: string;
  externalVirtualmanId?: string;
  externalSpeakerId?: string;
  speakerName: string;
  demoVideoUrl: string;
  createdAt: string;
}

export type AssetType = "image" | "video" | "music" | "voice";

export type AssetStatus = "ready" | "processing" | "failed";

export interface Asset {
  id: string;
  userId: string;
  sourceAvatarId?: string;
  name: string;
  assetType: AssetType;
  url: string;
  status: AssetStatus;
  externalSpeakerId?: string;
  voiceModel?: string;
  demoAudioUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface Script {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
}

export type VideoTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface MarketingAnalysis {
  overallScore: number;
  dimensions: { name: string; score: number; comment: string }[];
  summary: string;
  suggestions: string[];
}

export interface VideoTask {
  id: string;
  userId: string;
  avatarId: string;
  scriptId: string;
  status: VideoTaskStatus;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  scriptContent: string;
  avatarName: string;
  errorMessage: string | null;
  marketingAnalysis: MarketingAnalysis | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ScriptGenerateInput {
  industry: string;
  sellingPoints: string;
  city: string;
}
