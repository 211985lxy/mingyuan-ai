import { NextRequest, NextResponse } from "next/server"

import { env } from "@/env"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { listLarkBaseRecords } from "@/lib/lark-base"
import {
  toPlatformAccount,
  toPlatformVideo,
  type PlatformAccount,
  type PlatformVideo,
} from "@/lib/data-platform/summary-mapping"

export type { PlatformAccount, PlatformVideo } from "@/lib/data-platform/summary-mapping"

export type PlatformSummaryResponse =
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string; error?: unknown }
  | {
      status: "ok"
      accounts: PlatformAccount[]
      recentVideos: PlatformVideo[]
      fetchedAt: string
    }

export const runtime = "nodejs"

function buildNotConfiguredResponse() {
  const response: PlatformSummaryResponse = {
    status: "not_configured",
    message:
      "未配置多平台数据仓库的飞书 Base。请在环境变量中设置 LARK_PLATFORM_DATA_BASE_TOKEN 以及至少一个表 ID（LARK_PLATFORM_ACCOUNT_TABLE_ID / LARK_PLATFORM_VIDEO_TABLE_ID）。",
  }
  return NextResponse.json(response as unknown)
}

function buildLarkFetchTasks(baseToken: string, accountTableId?: string, videoTableId?: string) {
  const t: Array<Promise<PlatformAccount[] | PlatformVideo[]>> = []
  if (accountTableId) {
    t.push(listLarkBaseRecords({ baseToken, tableId: accountTableId, limit: 20, offset: 0, identity: "bot" })
      .then((rows) => rows.map(toPlatformAccount))
      .catch((err) => { console.error("[data-platform] 账号表读取失败:", err?.message || err); return [] as PlatformAccount[] }),
    )
  } else { t.push(Promise.resolve([] as PlatformAccount[])) }
  if (videoTableId) {
    t.push(listLarkBaseRecords({ baseToken, tableId: videoTableId, limit: 20, offset: 0, identity: "bot" })
      .then((rows) => rows.map(toPlatformVideo))
      .catch((err) => { console.error("[data-platform] 视频表读取失败:", err?.message || err); return [] as PlatformVideo[] }),
    )
  } else { t.push(Promise.resolve([] as PlatformVideo[])) }
  return t
}

function buildSummaryResponse(accounts: PlatformAccount[], recentVideos: PlatformVideo[]) {
  const sorted = [...recentVideos].sort((a, b) => {
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return bt - at
  })
  const response: PlatformSummaryResponse = { status: "ok", accounts, recentVideos: sorted, fetchedAt: new Date().toISOString() }
  return NextResponse.json(response as unknown)
}

function buildPlatformErrorResponse(err: unknown) {
  const response: PlatformSummaryResponse = {
    status: "error",
    message: err instanceof Error ? err.message : "读取飞书数据仓库失败",
    error: err instanceof Error ? { name: err.name, message: err.message } : err,
  }
  return NextResponse.json(response as unknown, { status: 500 })
}

/**
 * 多平台数据看板摘要：账号总览 + 近期作品数据
 * 如果未配置 LARK_PLATFORM_DATA_BASE_TOKEN，返回 not_configured，前端显示空态引导。
 */
export async function GET(request: NextRequest) {
  try { await authenticateRequest(request) } catch (err) { return authErrorResponse(err) }

  const baseToken = env.LARK_PLATFORM_DATA_BASE_TOKEN?.trim()
  const accountTableId = env.LARK_PLATFORM_ACCOUNT_TABLE_ID?.trim()
  const videoTableId = env.LARK_PLATFORM_VIDEO_TABLE_ID?.trim()
  if (!baseToken || (!accountTableId && !videoTableId)) return buildNotConfiguredResponse()

  try {
    const tasks = buildLarkFetchTasks(baseToken, accountTableId, videoTableId)
    const [accounts, recentVideos] = (await Promise.all(tasks)) as [PlatformAccount[], PlatformVideo[]]
    return buildSummaryResponse(accounts, recentVideos)
  } catch (err) { return buildPlatformErrorResponse(err) }
}
