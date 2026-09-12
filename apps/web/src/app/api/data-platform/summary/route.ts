import { NextRequest, NextResponse } from "next/server"

import { env } from "@/env"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { listLarkBaseRecords } from "@/lib/lark-base"
import { resolveBoundProject } from "@/lib/account-project-context"
import {
  toPlatformAccount,
  toPlatformVideo,
  type PlatformAccount,
  type PlatformVideo,
} from "@/lib/data-platform/summary-mapping"
import { isRowVisibleToProject } from "@/lib/data-platform/row-ownership"

export type { PlatformAccount, PlatformVideo } from "@/lib/data-platform/summary-mapping"

export type PlatformSummaryResponse =
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string; error?: unknown }
  | {
      status: "ok"
      accounts: PlatformAccount[]
      recentVideos: PlatformVideo[]
      fetchedAt: string
      /** true=部分表读取失败（对应数组为空是「读不到」而非「没数据」），前端应提示而非空态误导 */
      degraded?: boolean
      /** 读取失败的表与原因摘要（stderr 根因，已脱敏） */
      degradedReasons?: string[]
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

type LarkFailure = { table: string; code?: string; reason: string }
type LarkRow = Awaited<ReturnType<typeof listLarkBaseRecords>>[number]

/**
 * 单表读取，失败重试一次（生产观测：飞书侧存在成簇的瞬时失败，2026-09-10/11
 * 三天 18 次、当时连发复现 6/6 成功——一次退避重试可吸收绝大部分瞬断）。
 * 失败必须落全量根因：LarkCliError.stderr 是唯一真实原因（此前只打 message=
 * "Command failed"，18 次失败零诊断价值）。
 */
async function fetchTableRows(baseToken: string, tableId: string): Promise<LarkRow[]> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await listLarkBaseRecords({ baseToken, tableId, limit: 20, offset: 0, identity: "bot" })
    } catch (err) {
      const code = (err as { code?: string }).code
      const stderr = (err as { stderr?: string }).stderr
      console.error(
        `[data-platform] 飞书表读取失败(第${attempt}次): code=${code ?? "UNKNOWN"}`
          + ` stderr=${JSON.stringify((stderr || "").slice(0, 400))}`,
      )
      if (attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200))
        continue
      }
      throw err
    }
  }
  throw new Error("unreachable")
}

function summarizeLarkFailure(err: unknown): string {
  if (!(err instanceof Error)) return String(err).slice(0, 200)
  // message 形如「飞书 base +record-list 执行失败：Command failed: …」，剥离无效前缀；
  // stderr 才是真实原因（飞书 JSON 错误体）
  const stderr = (err as { stderr?: string }).stderr?.replace(/\s+/g, " ").trim()
  return (stderr || err.message.replace(/^.*执行失败：/, "")).slice(0, 200)
}

async function fetchTableMapped<T>(input: {
  baseToken: string
  tableId: string
  tableLabel: string
  /** 调用者归属项目：用于行级隔离；为 null（未绑定项目）时只看得到共享行 */
  projectId: string | null
  mapRow: (row: LarkRow) => T
}): Promise<{ mapped: T[]; failure?: LarkFailure }> {
  try {
    const rows = await fetchTableRows(input.baseToken, input.tableId)
    const visible = rows.filter((row) => isRowVisibleToProject(row.fields, input.projectId))
    return { mapped: visible.map(input.mapRow) }
  } catch (err) {
    return {
      mapped: [],
      failure: { table: input.tableLabel, code: (err as { code?: string }).code, reason: summarizeLarkFailure(err) },
    }
  }
}

function buildLarkFetchTasks(
  baseToken: string,
  projectId: string | null,
  accountTableId?: string,
  videoTableId?: string,
) {
  const tasks: Array<Promise<{ mapped: Array<PlatformAccount | PlatformVideo>; failure?: LarkFailure }>> = []
  if (accountTableId) {
    tasks.push(fetchTableMapped({ baseToken, projectId, tableId: accountTableId, tableLabel: "账号表", mapRow: toPlatformAccount }))
  } else { tasks.push(Promise.resolve({ mapped: [] })) }
  if (videoTableId) {
    tasks.push(fetchTableMapped({ baseToken, projectId, tableId: videoTableId, tableLabel: "视频表", mapRow: toPlatformVideo }))
  } else { tasks.push(Promise.resolve({ mapped: [] })) }
  return tasks
}

/**
 * 取调用者的归属项目 id，用于行级隔离。
 * 未绑定项目时返回 null（而非报错）——否则所有未绑定账号的看板都会直接不可用。
 */
async function resolveCallerProjectId(userId: string): Promise<string | null> {
  try {
    return (await resolveBoundProject({ userId })).id
  } catch {
    return null
  }
}

function buildSummaryResponse(
  accounts: PlatformAccount[],
  recentVideos: PlatformVideo[],
  failures: LarkFailure[],
) {
  const sorted = [...recentVideos].sort((a, b) => {
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return bt - at
  })
  const response: PlatformSummaryResponse = {
    status: "ok",
    accounts,
    recentVideos: sorted,
    fetchedAt: new Date().toISOString(),
    ...(failures.length ? { degraded: true, degradedReasons: failures.map((f) => `${f.table}: ${f.reason}`) } : {}),
  }
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
 * 行级隔离：只看得到「共享行」+「归属本项目的行」。
 * 如果未配置 LARK_PLATFORM_DATA_BASE_TOKEN，返回 not_configured，前端显示空态引导。
 */
export async function GET(request: NextRequest) {
  let user: { id: string; email: string }
  try { user = await authenticateRequest(request) } catch (err) { return authErrorResponse(err) }

  const projectId = await resolveCallerProjectId(user.id)
  const baseToken = env.LARK_PLATFORM_DATA_BASE_TOKEN?.trim()
  const accountTableId = env.LARK_PLATFORM_ACCOUNT_TABLE_ID?.trim()
  const videoTableId = env.LARK_PLATFORM_VIDEO_TABLE_ID?.trim()
  if (!baseToken || (!accountTableId && !videoTableId)) return buildNotConfiguredResponse()

  try {
    const tasks = buildLarkFetchTasks(baseToken, projectId, accountTableId, videoTableId)
    const results = await Promise.all(tasks)
    const failures = results.map((r) => r.failure).filter(Boolean) as LarkFailure[]
    return buildSummaryResponse(results[0].mapped as PlatformAccount[], results[1].mapped as PlatformVideo[], failures)
  } catch (err) { return buildPlatformErrorResponse(err) }
}
