import { DouyinAdapter, XiaohongshuAdapter } from '@/lib/tikhub/adapters'
import {
  fetchFromExternalDouyinApi,
  hasExternalDouyinApi,
} from './external-douyin-api'
import {
  fetchFromRedFoxDouyinApi,
  hasRedFoxDouyinApi,
} from './redfox-douyin-api'
import { fetchFromLocalCrawler } from './local-crawler'
import type {
  NormalizedAccount,
  NormalizedComment,
  NormalizedVideo,
  Platform,
  PlatformAdapter,
  VideoStats,
} from '@/lib/tikhub/types'

export type CompetitorCollectionSource = 'external_api' | 'redfox_api' | 'local_browser' | 'tikhub_api'

export interface CompetitorCollectionResult {
  platformUserId: string
  account: NormalizedAccount
  videos: NormalizedVideo[]
  comments: NormalizedComment[]
  collectionSource: CompetitorCollectionSource
  fallbackUsed: boolean
  fallbackReason: string | null
}

interface CollectDouyinInput {
  targetUrl: string
  platformUserId: string | null
  count?: number
}

interface CollectDouyinDeps {
  fetchFromLocalCrawler?: typeof fetchFromLocalCrawler
  fetchFromExternalApi?: typeof fetchFromExternalDouyinApi
  fetchFromRedFoxApi?: typeof fetchFromRedFoxDouyinApi
  apiAdapter?: PlatformAdapter
  hasExternalApi?: () => boolean
  hasRedFoxApi?: () => boolean
  hasTikHubApiKey?: () => boolean
  hasLocalCrawler?: () => boolean
}

function resolveDouyinDeps(deps: CollectDouyinDeps) {
  return {
    externalApi: deps.fetchFromExternalApi ?? fetchFromExternalDouyinApi,
    redfoxApi: deps.fetchFromRedFoxApi ?? fetchFromRedFoxDouyinApi,
    canUseExternalApi: deps.hasExternalApi ?? hasExternalDouyinApi,
    canUseRedFoxApi: deps.hasRedFoxApi ?? hasRedFoxDouyinApi,
    localCrawler: deps.fetchFromLocalCrawler ?? fetchFromLocalCrawler,
    apiAdapter: deps.apiAdapter ?? new DouyinAdapter(),
    hasTikHubApiKey: deps.hasTikHubApiKey ?? (() => Boolean(process.env.TIKHUB_API_KEY)),
    hasLocalCrawler: deps.hasLocalCrawler ?? (() => process.env.LOCAL_CRAWLER_ENABLED === 'true'),
  }
}

function buildCollectionResult(
  data: Pick<CompetitorCollectionResult, 'platformUserId' | 'account' | 'videos' | 'comments'>,
  collectionSource: CompetitorCollectionSource,
  count: number,
  fallbackUsed = false,
  fallbackReason: string | null = null,
): CompetitorCollectionResult {
  return {
    ...data,
    videos: data.videos.slice(0, count),
    collectionSource,
    fallbackUsed,
    fallbackReason,
  }
}

export async function collectDouyinCompetitorData(
  input: CollectDouyinInput,
  deps: CollectDouyinDeps = {},
): Promise<CompetitorCollectionResult> {
  const count = input.count ?? 50
  const {
    externalApi,
    redfoxApi,
    canUseExternalApi,
    canUseRedFoxApi,
    localCrawler,
    apiAdapter,
    hasTikHubApiKey,
    hasLocalCrawler,
  } = resolveDouyinDeps(deps)

  if (canUseExternalApi()) {
    const external = await externalApi({
      targetUrl: input.targetUrl,
      platformUserId: input.platformUserId,
      count,
    })
    return buildCollectionResult(external, 'external_api', count)
  }

  if (canUseRedFoxApi()) {
    try {
      const redfoxInput = await withResolvedShortLinkUserId(input, apiAdapter)
      const redfox = await redfoxApi({
        targetUrl: redfoxInput.targetUrl,
        platformUserId: redfoxInput.platformUserId,
        count,
      })
      return buildCollectionResult(redfox, 'redfox_api', count)
    } catch (err) {
      const fallbackReason = errorMessage(err)
      if (hasTikHubApiKey()) {
        return collectFromApiAdapter(apiAdapter, input, count, true, fallbackReason)
      }
      if (!hasLocalCrawler()) {
        throw err
      }
    }
  }

  if (hasLocalCrawler()) {
    try {
      const local = await localCrawler('douyin', input.targetUrl, count)
      return buildCollectionResult({
        ...local,
        platformUserId: local.account.platformUserId || input.platformUserId || '',
      }, 'local_browser', count)
    } catch (err) {
      const fallbackReason = errorMessage(err)

      if (!hasTikHubApiKey()) {
        throw err
      }

      return collectFromApiAdapter(apiAdapter, input, count, true, fallbackReason)
    }
  }

  if (hasTikHubApiKey()) {
    return collectFromApiAdapter(apiAdapter, input, count, false, null)
  }

  throw new Error('未配置真实对标账号抓取服务：请配置 COMPETITOR_DOUYIN_API_URL、REDFOX_API_KEY 或 TIKHUB_API_KEY。本地浏览器爬虫仅用于调试，可设置 LOCAL_CRAWLER_ENABLED=true。')
}

async function withResolvedShortLinkUserId(
  input: CollectDouyinInput,
  apiAdapter: PlatformAdapter,
): Promise<CollectDouyinInput> {
  if (input.platformUserId || !input.targetUrl.includes('v.douyin.com')) {
    return input
  }

  try {
    return {
      ...input,
      // ponytail: only resolve short links here because RedFox is the fragile provider in production.
      platformUserId: await apiAdapter.resolveUrl(input.targetUrl),
    }
  } catch {
    return input
  }
}

async function collectFromApiAdapter(
  apiAdapter: PlatformAdapter,
  input: CollectDouyinInput,
  count: number,
  fallbackUsed: boolean,
  fallbackReason: string | null,
): Promise<CompetitorCollectionResult> {
  const platformUserId = input.platformUserId ?? await apiAdapter.resolveUrl(input.targetUrl)
  const [account, videos] = await Promise.all([
    apiAdapter.fetchAccount(platformUserId),
    apiAdapter.fetchVideos(platformUserId, count),
  ])

  const videosWithStats = await mergeVideoStats(apiAdapter, videos)
  const comments = await fetchTopVideoComments(apiAdapter, videosWithStats)

  return {
    platformUserId,
    account,
    videos: videosWithStats,
    comments,
    collectionSource: 'tikhub_api',
    fallbackUsed,
    fallbackReason,
  }
}

async function mergeVideoStats(
  apiAdapter: PlatformAdapter,
  videos: NormalizedVideo[],
): Promise<NormalizedVideo[]> {
  const videoIds = videos.map(v => v.videoId)
  if (videoIds.length === 0) {
    return videos
  }

  let statsMap = new Map<string, VideoStats>()
  try {
    statsMap = await apiAdapter.fetchVideoStats(videoIds)
  } catch {
    return videos
  }

  return videos.map(v => {
    const s = statsMap.get(v.videoId)
    if (!s) return v
    return {
      ...v,
      views: s.views,
      likes: s.likes,
      comments: s.comments,
      shares: s.shares,
      collects: s.collects,
    }
  })
}

async function fetchTopVideoComments(
  apiAdapter: PlatformAdapter,
  videos: NormalizedVideo[],
): Promise<NormalizedComment[]> {
  const top5 = [...videos]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 5)

  const comments: NormalizedComment[] = []
  for (const video of top5) {
    try {
      comments.push(...await apiAdapter.fetchComments(video.videoId, 20))
    } catch {
      // Comment collection is helpful but non-fatal for the report.
    }
  }

  return comments
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

// ── 通用采集分发（支持多平台） ──────────────────────────────────

interface CollectInput {
  platform: Platform
  targetUrl: string
  platformUserId: string | null
  count?: number
}

/**
 * 按平台分发到对应的采集链路。
 * - 抖音：走现有的 4 源回退链（external → redfox → local → tikhub）
 * - 小红书：走 TikHub XiaohongshuAdapter（+ local_browser 兜底）
 * - 其他平台：暂不支持
 */
export async function collectCompetitorData(
  input: CollectInput,
  deps: CollectDouyinDeps = {},
): Promise<CompetitorCollectionResult> {
  if (input.platform === 'xiaohongshu') {
    return collectXiaohongshuCompetitorData(input, deps)
  }

  if (input.platform === 'douyin') {
    return collectDouyinCompetitorData(input, deps)
  }

  throw new Error(`平台 ${input.platform} 暂不支持对标账号数据采集`)
}

async function collectXiaohongshuCompetitorData(
  input: CollectInput,
  deps: CollectDouyinDeps = {},
): Promise<CompetitorCollectionResult> {
  const count = input.count ?? 50
  const hasTikHubApiKey = deps.hasTikHubApiKey ?? (() => Boolean(process.env.TIKHUB_API_KEY))
  const hasLocalCrawler = deps.hasLocalCrawler ?? (() => process.env.LOCAL_CRAWLER_ENABLED === 'true')
  const localCrawler = deps.fetchFromLocalCrawler ?? fetchFromLocalCrawler
  const apiAdapter = deps.apiAdapter ?? new XiaohongshuAdapter()

  // 主链路：TikHub XiaohongshuAdapter
  if (hasTikHubApiKey()) {
    try {
      return await collectFromApiAdapter(apiAdapter, input, count, false, null)
    } catch (err) {
      const fallbackReason = errorMessage(err)
      if (hasLocalCrawler()) {
        // 降级到本地浏览器爬虫
        try {
          const local = await localCrawler('xiaohongshu', input.targetUrl, count)
          return {
            platformUserId: local.account.platformUserId || input.platformUserId || '',
            account: local.account,
            videos: local.videos.slice(0, count),
            comments: local.comments,
            collectionSource: 'local_browser',
            fallbackUsed: true,
            fallbackReason,
          }
        } catch {
          // local_browser 也失败，抛 TikHub 的错误
        }
      }
      throw err
    }
  }

  // 兜底链路：本地浏览器爬虫
  if (hasLocalCrawler()) {
    const local = await localCrawler('xiaohongshu', input.targetUrl, count)
    return {
      platformUserId: local.account.platformUserId || input.platformUserId || '',
      account: local.account,
      videos: local.videos.slice(0, count),
      comments: local.comments,
      collectionSource: 'local_browser',
      fallbackUsed: false,
      fallbackReason: null,
    }
  }

  throw new Error('小红书对标账号采集需要配置 TIKHUB_API_KEY 或开启 LOCAL_CRAWLER_ENABLED=true')
}
