/**
 * 账号作品数据源（WP-A1）：TikHub 主 + 红狐备 + 响亮报错。
 *
 * 背景：抖音开放平台的「授权账号作品列表」能力已下线（实测错误码 28001056
 * 「该能力API已下线，不再支持调用」），网站应用侧也无可申请的数据能力。
 * 因此作品数据改走第三方公开数据通道，二者都返回同一 `NormalizedVideo` 结构：
 *   - 主：TikHub `/api/v1/douyin/app/v3/fetch_user_post_videos`（通用覆盖，生产主力）
 *   - 备：红狐 `/story/api/dyData/queryWorkList`（账号在「优质库」内时数据更细）
 *
 * 纪律：
 * 1. 全部通道失败时**抛错**，不返回空数组——避免"假绿"（历史上 API 挂了但 cron 报成功）。
 * 2. 单账号失败不阻断批次，由调用方（runAccountWorksSync）按账号隔离错误。
 * 3. 不使用本地浏览器兜底（cron 环境无浏览器），显式 localFallback: false。
 */

import { DouyinAdapter } from "@/lib/tikhub/adapters/douyin"
import type { NormalizedVideo } from "@/lib/tikhub/types"
import { fetchFromRedFoxDouyinApi, hasRedFoxDouyinApi } from "@/lib/competitor-analysis/redfox-douyin-api"
import type { SyncedWorkItem } from "@/lib/aim/account-works-sync"

export type AccountWorksSource = "tikhub" | "redfox"

export interface AccountWorksFetchInput {
  /** TikHub/红狐 定位账号所需（由主页链接解析） */
  secUserId: string | null
  /** 红狐备用通道需要主页链接 */
  profileUrl: string | null
  count: number
}

export interface AccountWorksFetchResult {
  items: SyncedWorkItem[]
  source: AccountWorksSource
  fallbackUsed: boolean
  fallbackReason: string | null
}

function toSyncedWorkItem(video: NormalizedVideo): SyncedWorkItem {
  return {
    externalWorkId: video.videoId,
    title: video.title || "未命名作品",
    coverUrl: video.coverUrl || null,
    publishedAt:
      typeof video.createTime === "number" && video.createTime > 0
        ? new Date(video.createTime * 1000).toISOString()
        : null,
    stats: {
      views: video.views,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      saves: video.collects,
    },
  }
}

/** 归一化后的作品 → 仅保留有效项（缺 ID 的丢弃，避免脏数据进投影表）。 */
function toSyncedWorkItems(videos: NormalizedVideo[]): SyncedWorkItem[] {
  return videos.filter((video) => Boolean(video.videoId)).map(toSyncedWorkItem)
}

async function fetchViaTikHub(input: AccountWorksFetchInput): Promise<SyncedWorkItem[]> {
  if (!input.secUserId) {
    throw new Error("缺少 sec_user_id（未采集抖音主页链接）")
  }
  const adapter = new DouyinAdapter({ localFallback: false })
  const videos = await adapter.fetchVideos(input.secUserId, input.count)
  return toSyncedWorkItems(videos)
}

async function fetchViaRedFox(input: AccountWorksFetchInput): Promise<SyncedWorkItem[]> {
  if (!input.profileUrl) {
    throw new Error("缺少抖音主页链接（红狐通道需要）")
  }
  const result = await fetchFromRedFoxDouyinApi({
    targetUrl: input.profileUrl,
    platformUserId: input.secUserId,
    count: input.count,
  })
  return toSyncedWorkItems(result.videos)
}

/**
 * 主通道失败即回落备通道；两通道都失败则抛错（含双方原因，便于定位是权限/覆盖/网络问题）。
 */
export async function fetchAccountWorks(
  input: AccountWorksFetchInput,
): Promise<AccountWorksFetchResult> {
  const tikhubReasons: string[] = []
  const redfoxReasons: string[] = []

  try {
    const items = await fetchViaTikHub(input)
    if (items.length === 0) {
      tikhubReasons.push("TikHub 返回 0 条作品")
    } else {
      return { items, source: "tikhub", fallbackUsed: false, fallbackReason: null }
    }
  } catch (error) {
    tikhubReasons.push(`TikHub: ${error instanceof Error ? error.message : "未知错误"}`)
  }

  if (hasRedFoxDouyinApi()) {
    try {
      const items = await fetchViaRedFox(input)
      if (items.length > 0) {
        return {
          items,
          source: "redfox",
          fallbackUsed: true,
          fallbackReason: tikhubReasons.join("；"),
        }
      }
      redfoxReasons.push("红狐返回 0 条作品")
    } catch (error) {
      redfoxReasons.push(`红狐: ${error instanceof Error ? error.message : "未知错误"}`)
    }
  } else {
    redfoxReasons.push("红狐: REDFOX_API_KEY 未配置")
  }

  throw new Error(
    `作品数据通道均未取到数据（${[...tikhubReasons, ...redfoxReasons].join("；")}）`,
  )
}

/** 是否至少配置了一条可用通道（供探针与交付门禁使用）。 */
export function hasAnyWorksChannel(): boolean {
  return Boolean(process.env.TIKHUB_API_KEY?.trim() || process.env.TIKHUB_BASE_URL?.trim() || hasRedFoxDouyinApi())
}
