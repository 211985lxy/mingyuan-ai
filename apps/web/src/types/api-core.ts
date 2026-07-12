import type { ContentType, ExpressionBlueprint, TemplateVariable } from "@/types/content-template";

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  plan: string;
  authVideoUrl?: string | null;
  createdAt?: string;
  expiresAt?: string | null;
  isActivated?: boolean;
  subscriptionStatus?: "inactive" | "active" | "expired";
  dailyLimit?: number;
  videosCreatedToday?: number;
}

export interface ApiAgentApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  allowedProjectCount: number;
  allowedAgents: string[];
  dailyLimit: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiIpProfile {
  id: string;
  userId: string;
  displayName: string | null;
  nickname: string | null;
  industry: string | null;
  primaryOffer: string | null;
  targetAudience: string | null;
  ipTraits: string | null;
  toneOfVoice: string | null;
  proofPoints: string | null;
  callToAction: string | null;
  promptSnapshot: string | null;
  isComplete: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // v2 fields (Phase 10)
  profileVersion?: number;
  surveyIndustry?: string | null;
  surveyTargetCustomer?: string | null;
  surveyMonetization?: unknown | null;  // JSON type
  surveyPersonalTraits?: string | null;
  surveyContentGoal?: string | null;
  business?: unknown | null;  // JSON type
  persona?: unknown | null;   // JSON type
  content?: unknown | null;   // JSON type
}

export interface IpProfileResponse {
  profile: ApiIpProfile | null;
  isComplete: boolean;
  missingFields: string[];
  promptSnapshot: string | null;
}

// v2 IP Profile Generation (Phase 10)
export interface GeneratePositioningRequest {
  surveyIndustry: string
  surveyTargetCustomer: string
  surveyMonetization: string[]
  surveyPersonalTraits: string
  surveyContentGoal: string
}

export interface BusinessPositioning {
  core: string
  audience: string
  value: string
  differentiator: string
}

export interface PersonaDesign {
  expertiseLevel: string
  expressionStyle: string
  traits: string[]
}

export interface ContentTheme {
  name: string
  ratio: number
}

export interface ContentStrategy {
  themes: ContentTheme[]
  formats: string[]
  rhythm: string
}

export interface ThreeDPositioning {
  business: BusinessPositioning
  persona: PersonaDesign
  content: ContentStrategy
}

export interface GeneratePositioningResponse {
  data: ThreeDPositioning
}

export interface GeneratePositioningError {
  error: string
}

export interface ApiAvatar {
  id: string;
  userId: string;
  name: string;
  status: string;
  coverUrl: string | null;
  sourceVideoUrl: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  externalTaskId: string | null;
  externalVirtualmanId: string | null;
  externalSpeakerId: string | null;
  speakerName: string | null;
  demoVideoUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAsset {
  id: string;
  userId: string;
  sourceAvatarId: string | null;
  name: string;
  assetType: string;
  url: string;
  size: number | null;
  status: string;
  externalTaskId: string | null;
  externalSpeakerId: string | null;
  voiceModel: string | null;
  demoAudioUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiScript {
  id: string;
  userId: string;
  content: string;
  sourceTemplateId: string | null;
  generationRunId: string | null;
  ipProfileId: string | null;
  structureId: string | null;
  status: string;
  qualityScore: number | null;
  qualityMetadata: ScriptQualityMetadata | null;
  selectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptQualityMetadata {
  structuralCompliance: number;
  viewpointClarity: number;
  evidenceStrength: number;
  ctaClarity: number;
  voiceFit: number;
  lengthInRange: boolean;
}
