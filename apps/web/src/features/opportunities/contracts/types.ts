// ─── Content Opportunity Domain Types ─────────────────────

export type OpportunityPlatform = "douyin" | "wechat_channels"

export type SearchType = "video" | "topic" | "account"

export type ScoreConfidence = "high" | "medium" | "low"

export type SortOrder = "comprehensive" | "latest" | "popular"

export type TimeRange = "24h" | "7d" | "30d" | "all"

/** 统一搜索结果结构 */
export interface OpportunityItem {
  platform: OpportunityPlatform
  sourceId: string
  sourceUrl: string
  title: string
  author: {
    id?: string
    name: string
    followerCount?: number
  }
  publishedAt?: string
  durationSeconds?: number
  metrics: {
    views?: number
    likes?: number
    comments?: number
    shares?: number
    collects?: number
  }
  opportunityScore?: number
  scoreConfidence: ScoreConfidence
  scoreBreakdown?: ScoreBreakdown
  matchedKeywords: string[]
  fetchedAt: string
}

/** 评分明细 */
export interface ScoreBreakdown {
  freshness: number
  engagementRate: number
  relativeBurst: number
  crossPlatform: number
  projectMatch: number
  availableSignals: string[]
  missingSignals: string[]
}

/** 搜索筛选条件 */
export interface SearchFilters {
  timeRange?: TimeRange
  sortOrder?: SortOrder
  durationMin?: number
  durationMax?: number
  followerMin?: number
  followerMax?: number
  viewsMin?: number
  likesMin?: number
  commentsMin?: number
  lowFollowerViral?: boolean
  highEngagement?: boolean
  watchedAccountsOnly?: boolean
}

/** 搜索请求参数 */
export interface SearchParams {
  keyword: string
  searchType?: SearchType
  platforms?: OpportunityPlatform[]
  filters?: SearchFilters
  projectId?: string
  count?: number
  cursor?: string
}

/** 单平台搜索结果 */
export interface PlatformSearchResult {
  platform: OpportunityPlatform
  status: "ok" | "error" | "timeout"
  items: OpportunityItem[]
  cursor?: string
  hasMore?: boolean
  total?: number
  error?: string
  durationMs?: number
}

/** 聚合搜索结果 */
export interface AggregatedSearchResult {
  items: OpportunityItem[]
  platformResults: PlatformSearchResult[]
  total: number
  cursor?: string
  hasMore: boolean
  warnings: string[]
}

/** 批量分析结果 */
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
  sampleReferences: Record<string, string[]>
}

export interface CandidateTopic {
  title: string
  angle: string
  rationale: string
  referencedSamples: string[]
  riskNote?: string
}

/** 平台筛选能力声明 */
export interface FilterCapability {
  key: keyof SearchFilters
  label: string
  supported: boolean
  note?: string
}
