export type CommentRadarPlatform = 'douyin' | 'xiaohongshu'
export type SourceType = 'video' | 'account' | 'unknown'
export type JobStatus = 'pending' | 'resolving' | 'collecting' | 'analyzing' | 'completed' | 'partial' | 'failed'
export interface ResolvedSource { platform: CommentRadarPlatform; sourceType: SourceType; itemId: string | null; videoLimit: number; rawUrl: string }
export interface JobProgress { status: JobStatus; totalItems: number; processedItems: number; failedItems: number; reportedCommentCount: number; collectedCommentCount: number; currentItemTitle: string | null; canContinue: boolean; partialReason: string | null; errorMessage: string | null }
