/**
 * content-pipeline — 视频内容处理流水线（完整版 5a-5e）
 */

// 链接检测
export { detectVideoLinks, hasVideoLink, extractFirstVideoUrl } from "./video-link-detector"
export type { DetectedVideoLink, VideoLinkDetectionResult } from "./video-link-detector"

// 核心流水线
export { processVideo } from "./video-processor"
export type { VideoProcessingInput, VideoProcessingResult, AiSummaryResult } from "./video-processor"

// 飞书 Base 存储
export {
  readContentStoreConfig,
  findExistingRecord,
  upsertContentItem,
  createPendingContentItem,
} from "./lark-content-store"
export type { ContentItemRecord, ContentItemStatus, ContentStoreConfig } from "./lark-content-store"

// 5c 选题提取
export { extractTopicsFromVideo } from "./topic-bridge"
export type { TopicExtractionResult, TopicExtractionInput } from "./topic-bridge"

// 5d 竞品分析
export { checkCompetitorMatch } from "./competitor-bridge"
export type { CompetitorMatchResult, CompetitorMatchInput } from "./competitor-bridge"

// 5e 文案灵感
export { generateCopyInspiration } from "./copy-inspiration-bridge"
export type { CopyInspirationResult, CopyInspirationInput } from "./copy-inspiration-bridge"