/**
 * content-pipeline — 视频内容处理流水线
 *
 * 统一处理来自两条路由（抖音群 / 微信视频号）的视频内容。
 *
 * 模块说明：
 *   video-link-detector  — 从消息文本中检测和提取视频链接
 *   video-processor      — 核心处理流水线（提取→总结→存储）
 *   lark-content-store   — 飞书 Base 「内容素材库」读写器
 */

export { detectVideoLinks, hasVideoLink, extractFirstVideoUrl } from "./video-link-detector"
export type { DetectedVideoLink, VideoLinkDetectionResult } from "./video-link-detector"

export { processVideo } from "./video-processor"
export type { VideoProcessingInput, VideoProcessingResult, AiSummaryResult } from "./video-processor"

export {
  readContentStoreConfig,
  findExistingRecord,
  upsertContentItem,
  createPendingContentItem,
} from "./lark-content-store"
export type { ContentItemRecord, ContentItemStatus, ContentStoreConfig } from "./lark-content-store"
