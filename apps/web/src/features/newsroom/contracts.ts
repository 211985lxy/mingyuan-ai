/**
 * 编辑室（Searcher → Writer → Editor）最小可复用契约。
 * SourceBrief ≡ MaterialAnchorBundle；状态只活在 taskSpec.newsroom / BackgroundTask。
 */

export const NEWSROOM_MAX_SAMPLES = 10

export type NewsroomRunState =
  | "searching"
  | "writing"
  | "editing"
  | "done"
  | "failed"

/** 写入 taskSpec.newsroom.stage 的细粒度阶段 */
export type NewsroomStage =
  | "writing_ready"
  | "writing"
  | "editing"
  | "done"
  | "failed"

export interface GroundingPolicy {
  requireSampleCitation: boolean
  forbidUnsourcedClaims: boolean
  allowMissingAsPlaceholder: true
}

export const DEFAULT_NEWSROOM_GROUNDING_POLICY: GroundingPolicy = {
  requireSampleCitation: true,
  forbidUnsourcedClaims: true,
  allowMissingAsPlaceholder: true,
}

export interface SourceItem {
  /** 稳定 id：platform+sourceId */
  id: string
  /** 展示用序号（[样本1]…） */
  index: number
  platform: string
  sourceId: string
  sourceUrl: string
  title: string
  authorName?: string
  metrics?: Record<string, number>
  opportunityScore?: number
  excerpt?: string
}

export interface SourceCandidateTopic {
  title: string
  angle: string
  rationale: string
  referencedSamples: string[]
  riskNote?: string
}

export interface SourceBrief {
  collectionId?: string
  theme?: string
  samples: SourceItem[]
  candidateTopics: SourceCandidateTopic[]
  mustCite: string[]
  avoidCopy: string[]
  groundingPolicy: GroundingPolicy
  /** 分析侧 sampleReferences（主题 → 样本 id） */
  sampleReferences?: Record<string, string[]>
}

export interface NewsroomTaskMeta {
  stage: NewsroomStage | NewsroomRunState
  collectionId?: string
  sourceCount?: number
  generationId?: string
  editorDiffSummary?: string
  pipelineTaskId?: string
}

export type ContentReviewMode = "review_report" | "editor_revise"

export function sourceItemId(platform: string, sourceId: string): string {
  return `${platform}:${sourceId}`
}

export function isSourceBrief(value: unknown): value is SourceBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Array.isArray(record.samples) && Array.isArray(record.candidateTopics)
}
