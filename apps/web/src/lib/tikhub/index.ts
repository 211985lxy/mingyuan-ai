export { tikhubGet, TikHubError } from './client'
export type {
  TikHubResponse,
  NormalizedAccount,
  NormalizedVideo,
  NormalizedComment,
  CompetitorMetrics,
  CompetitorAnalysisResult,
  Platform,
  VideoStats,
  PlatformAdapter,
} from './types'
export { detectPlatform, extractUserId, parseUrl } from './url-parser'
export type { ParsedUrl } from './url-parser'
export { getAdapter, DouyinAdapter, XiaohongshuAdapter } from './adapters/index'
