export interface ApiVideoStructure {
  id: string;
  name: string;
  displayName: string;
  subtitle: string | null;
  description: string | null;
  useCase: string | null;
  blueprint: ApiVideoStructureBlueprint;
  sortOrder: number;
  status: string;
}

export type StructurePace = "fast" | "medium" | "slow";
export type StructureEvidenceDensity = "low" | "medium" | "high";
export type StructureCtaStyle = "soft" | "direct" | "hard";
export type StructureSubtitleStyle =
  | "minimal"
  | "standard"
  | "highlight"
  | "chapter";
export type StructureVisualPriority =
  | "talking_head"
  | "balanced"
  | "visual_first";

export interface ApiStructurePackagingIntent {
  subtitleStyle: StructureSubtitleStyle;
  visualPriority: StructureVisualPriority;
  preferredTemplateCapabilities: string[];
  requiredTemplateCapabilities?: string[];
  recommendedMaterialRoles: string[];
  bgmGuidance: string;
  defaultPackRules?: Record<string, unknown> | null;
  defaultProcessRules?: Record<string, unknown> | null;
}

export interface ApiVideoStructureBlueprint {
  openingPattern: string;
  narrativeBeats: string[];
  evidenceSlots: number;
  ctaSlot: string;
  durationRange: { min: number; max: number };
  pace?: StructurePace;
  evidenceDensity?: StructureEvidenceDensity;
  ctaStyle?: StructureCtaStyle;
  packagingIntent?: ApiStructurePackagingIntent | null;
}

export interface ApiPackagingTemplateRecommendation {
  tier: "recommended" | "acceptable" | "weak_fit" | "blocked";
  score: number;
  reasons: string[];
  blockingReasons?: string[];
  presetPackRules?: Record<string, unknown> | null;
  presetProcessRules?: Record<string, unknown> | null;
  recommendedMaterialRoles?: string[];
  bgmGuidance?: string | null;
}

export interface ApiPackagingRecommendationContext {
  structureId: string | null;
  scriptId: string | null;
  packagingTemplateId: string | null;
  tier: "recommended" | "acceptable" | "weak_fit" | "blocked";
  score: number;
  reasons: string[];
  recommendedMaterialRoles: string[];
  bgmGuidance?: string | null;
}

export interface ApiVideoPackagingTemplate {
  id: string;
  shanjianId: string;
  name: string;
  coverUrl: string | null;
  demoUrl: string | null;
  scene: string;
  capabilities: string[];
  description: string | null;
  sortOrder: number;
  status: string;
  recommendation?: ApiPackagingTemplateRecommendation | null;
}

export type PackagingMaterialSource =
  | "manual_upload"
  | "manual_library"
  | "ai_pexels"
  | "ai_pixabay";

export type PackagingMaterialOssStatus =
  | "none"
  | "pending"
  | "transferring"
  | "ready"
  | "failed";

export interface MaterialAssignment {
  role: string;
  fileUrl: string;
  type: "image" | "video";
  source?: PackagingMaterialSource;
  assetId?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  pexelsId?: number | null;
  searchQuery?: string | null;
  ossStatus?: PackagingMaterialOssStatus | null;
  /** "generic" = came from abstract fallback; "matched" = passed relevance scoring */
  quality?: "generic" | "matched";
}

export interface BackgroundMusicSelection {
  audioUrl: string;
  volume: number;
  assetId?: string | null;
  source?: "manual_upload" | "manual_library";
}

export interface PackagingMaterialSuggestionsResponse {
  suggestions: MaterialAssignment[];
  meta: {
    scriptEstimatedDuration: number;
    targetMaterialDuration: number;
    totalSuggested: number;
    planSource: "llm" | "deterministic" | "abstract_fallback";
  };
}

export interface ApiVideoProductionPlan {
  id: string;
  userId: string;
  scriptId: string;
  packagingTemplateId: string | null;
  structureId: string | null;
  styleId: string;
  materials: MaterialAssignment[] | null;
  backgroundMusic: BackgroundMusicSelection | null;
  packRules: Record<string, unknown> | null;
  processRules: Record<string, unknown> | null;
  recommendationContext: ApiPackagingRecommendationContext | null;
  videoType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoCreativeBrief {
  structureId: string;
  templateId: string;
  inputs: Record<string, string>;
  hotTopic?: string | null;
}
