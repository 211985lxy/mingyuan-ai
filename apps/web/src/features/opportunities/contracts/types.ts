// ─── Content Opportunity Types ─────────────────────────────

export type OpportunityPlatform = "douyin" | "wechat_channels"

export interface OpportunityAuthor {
  id: string
  name: string
  followerCount?: number
  avatarUrl?: string
}

export interface OpportunityMetrics {
  views?: number
  likes?: number
  comments?: number
  shares?: number
  collects?: number
}

export interface OpportunityItem {
  platform: OpportunityPlatform
  sourceId: string
  sourceUrl: string
  title: string
  coverUrl?: string
  author: OpportunityAuthor
  publishedAt?: string
  durationSeconds?: number
  metrics: OpportunityMetrics
  opportunityScore?: number
  scoreConfidence?: "high" | "medium" | "low"
  scoreBreakdown?: ScoreBreakdown
  /** 用户问题命中加分标识（仅命中时出现，前端无需穿透 scoreBreakdown 即可展示） */
  userQuestionBoost?: true
  /** 命中的用户问题卡 ID 列表（来自 applyUserQuestionBoost 管线） */
  matchedQuestionIds?: string[]
}

export interface ScoreBreakdown {
  freshness: number
  engagement: number
  burst: number
  crossPlatform: number
  projectMatch: number
  /** 用户问题命中加分标识（applyUserQuestionBoost 后处理时写入，不参与加权排序） */
  userQuestionBoost?: true
  /** 命中的用户问题卡 ID 列表，用于前端追溯匹配来源 */
  matchedQuestionIds?: string[]
}

export interface SearchFilters {
  sortOrder?: "comprehensive" | "latest" | "popular"
  timeRange?: string
  minLikes?: number
  minComments?: number
  maxDurationSeconds?: number
  minDurationSeconds?: number
  lowFollowerViral?: boolean
}

export interface SearchRequest {
  keyword: string
  platforms: OpportunityPlatform[]
  count?: number
  filters?: SearchFilters
  projectId?: string
}

export interface SearchResponse {
  items: OpportunityItem[]
  warnings: string[]
  platformStatus: Record<string, "ok" | string>
  cached?: boolean
}

// ─── Collection Types ──────────────────────────────────────

export interface CollectionItemInput {
  platform: OpportunityPlatform
  sourceId: string
  sourceUrl: string
  title: string
  authorName: string
  authorId?: string
  followerCount?: number
  publishedAt?: string
  durationSeconds?: number
  views?: number
  likes?: number
  comments?: number
  shares?: number
  collects?: number
  opportunityScore?: number
  scoreConfidence?: string
}

export interface CandidateTopic {
  title: string
  angle: string
  rationale: string
  referencedSamples: string[]
  riskNote?: string
}

export interface CollectionAnalysis {
  highFrequencyThemes: string[]
  commonOpenings: string[]
  contentStructures: string[]
  sharedViewpoints: string[]
  commentNeeds: string[]
  homogeneityRisk: string
  reusablePatterns: string[]
  avoidExpressions: string[]
  originalAngles: string[]
  candidateTopics: CandidateTopic[]
  sampleReferences?: Record<string, string[]>
}
