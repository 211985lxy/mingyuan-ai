import type {
  ContentType,
  ExpressionBlueprint,
  HotTopic,
  TemplateVariable,
} from "@/types/content-template";

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

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicTemplateListItem {
  id: string;
  displayName: string;
  description: string | null;
  hookType: string | null;
  videoType: string;
  industry: string[];
  contentType: ContentType;
  tags: string[];
  featured: boolean;
  usageCount: number;
  variables: TemplateVariable[];
  expressionBlueprint: ExpressionBlueprint | null;
}

export interface PublicTemplateDetail extends PublicTemplateListItem {
  scriptTemplate: string;
  shanjianStyleId: string | null;
  videoType: string;
  packRulesJson: unknown;
  processRulesJson: unknown;
}

export interface HotTopicsResponse {
  topics: HotTopic[];
  updatedAt: string;
}

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
  token: string;
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

// ─── Topic Engine (v5.0) ────────────────────────────────

export type ApiTopicRecommendationMode = "normal" | "daily" | "weekly";

export interface ApiTopicCard {
  title: string;
  elementCodes: string[];
  openingTypeCode: string;
  structureCode: string;
  rationale?: string;
  topicType?: "人设型" | "转化型" | "流量型";
  sourceType?: "个人灵感" | "客户资料" | "公司卖点" | "行业热点" | "对标参考";
  score?: number;
  scoreReason?: string;
  scoreBreakdown?: {
    projectFit: number;
    contentValue: number;
    viralHook: number;
    conversionFit: number;
    feasibility: number;
  };
  reviewVerdict?: "strong" | "usable" | "observe" | "revise";
  revisionAdvice?: string;
  hook?: string;
  angle?: string;
  cta?: string;
  contentLine?: string;
  defamiliarization?: {
    scarcityType?: "scenery" | "emotion" | "beauty" | "info" | "curio" | "event";
    rhetoric?: "fu" | "bi" | "xing";
    noveltyScore?: number;
    note?: string;
    advice?: string;
  };
}

export interface ApiTopicGenerateResponse {
  topicSelectionId: string;
  cards: ApiTopicCard[];
  elementCodes: string[];
  sourceHighlights?: Array<{
    category: string;
    title: string;
    content: string;
  }>;
}

export interface ApiTopicSelectResponse {
  topicSelectionId: string;
  selectedIndex: number;
  selectedCard: ApiTopicCard;
  status: string;
}

export interface ApiOpeningType {
  id: string;
  code: string;
  name: string;
  description: string;
  formulas: { template: string; example?: string }[];
}

export interface ApiCopyStructure {
  id: string;
  code: string;
  name: string;
  description: string;
  beats: { key: string; label: string; guidance?: string }[];
  caseStudy?: string;
}

export interface ApiEndingType {
  id: string;
  code: string;
  name: string;
  description: string;
  guidance: string;
}

// ─── Competitor Analysis (v5.0) ─────────────────────────
import type { CompetitorMetrics, CompetitorAnalysisResult } from "@/lib/tikhub/types"
export type { CompetitorMetrics, CompetitorAnalysisResult }

export type CompetitorAnalysisStatus =
  | "pending"
  | "scraping"
  | "enriching"
  | "analyzing"
  | "completed"
  | "failed"

export type CompetitorCollectionSource = "external_api" | "redfox_api" | "local_browser" | "tikhub_api";

export interface ApiCompetitorAnalysis {
  id: string;
  status: CompetitorAnalysisStatus;
  platform: string;
  targetUrl: string;
  accountName: string | null;
  accountAvatar: string | null;
  followerCount: number | null;
  videoCount: number | null;
  // Extended account info
  accountSignature: string | null;
  accountTotalLikes: number | null;
  accountFollowingCount: number | null;
  accountIsVerified: boolean;
  accountVerifyInfo: string | null;
  metricsData: CompetitorMetrics | null;
  analysisResult: CompetitorAnalysisResult | null;
  overallScore: number | null;
  collectionSource: CompetitorCollectionSource | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ApiCompetitorReport {
  id: string;
  platform: string;
  targetUrl: string;
  status: CompetitorAnalysisStatus;
  accountName: string | null;
  accountAvatar: string | null;
  followerCount: number | null;
  overallScore: number | null;
  collectionSource: CompetitorCollectionSource | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface CompetitorReportsResponse {
  items: ApiCompetitorReport[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiCompetitorWebResearchItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
  source: string;
}

export interface ApiCompetitorWebResearch {
  query: string;
  items: ApiCompetitorWebResearchItem[];
  warnings: string[];
  availability: {
    web: boolean;
    rss: boolean;
    summary: string;
  };
}
