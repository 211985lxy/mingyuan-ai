import type { ApiHotTopicFit, ApiHotTopicInsight } from "./api-insights";
import type { ApiVideoStructureBlueprint } from "./api-video";

export interface ApiContentGenerationRun {
  id: string;
  userId: string;
  ipProfileId: string;
  templateId: string;
  structureId: string | null;
  structureSnapshot: ApiVideoStructureBlueprint | null;
  hotTopicId: string | null;
  hotTopic: string | null;
  hotTopicInsight: ApiHotTopicInsight | null;
  hotTopicFit: ApiHotTopicFit | null;
  inputsJson: Record<string, string>;
  promptText: string;
  model: string;
  status: string;
  qualityScore: number | null;
  qualityMetadata: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EnhancementStatus = "none" | "pending" | "processing" | "completed" | "failed";

export interface ApiVideoTask {
  id: string;
  userId: string;
  avatarId: string | null;
  scriptId: string | null;
  productionPlanId: string | null;
  structureId: string | null;
  packagingTemplateId: string | null;
  status: string;
  deliveryStatus?: "pending" | "durable" | "degraded";
  deliveryWarning?: string | null;
  deliveryExpiresAt?: string | null;
  videoType: string;
  videoUrl: string | null;
  coverUrl: string | null;
  scriptContent: string;
  avatarName: string;
  duration: number | null;
  externalTaskId: string | null;
  structureSnapshot: Record<string, unknown> | null;
  packagingSnapshot: Record<string, unknown> | null;
  shanjianPayload: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  marketingAnalysis: MarketingAnalysisData | null;
  hotTopic?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sourceTemplateId?: string | null;
  sourceTemplateTags?: string[];
  // 4K Enhancement fields
  enhancementStatus?: EnhancementStatus | null;
  enhancementJobId?: string | null;
  enhanced4kUrl?: string | null;
  enhanced4kCoverUrl?: string | null;
  enhanced4kDuration?: number | null;
  enhancementErrorCode?: string | null;
  enhancementErrorMessage?: string | null;
  enhancementStartedAt?: string | null;
  enhancementCompletedAt?: string | null;
}

export interface MarketingAnalysisData {
  overallScore: number;
  dimensions: { name: string; score: number; comment: string }[];
  summary: string;
  suggestions: string[];
}
