import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { collectDouyinCompetitorData } from "@/lib/competitor-analysis/collector"
import { generateRequestId, hashLogIdentifier, logger } from "@/lib/logger"
import { enforceWatchRefreshBetaLimit } from "@/lib/internal-beta-limits"
import { calculateViralVideos } from "@/lib/competitor-watch-viral"
import { watchAccountRefreshBodySchema } from "@/features/competitor/contracts/api"

type RefreshLog = Pick<typeof logger, "info" | "error">

/**
 * 同行对标：根据账号池的现有记录，串行执行本地采集 + 爆款计算
 * 避免同时打开多个浏览器造成风控和机器压力
 */
export const maxDuration = 300
export const runtime = "nodejs"

async function refreshAccount(
  account: Awaited<ReturnType<typeof prisma.watchAccount.findMany>>[number],
  log: RefreshLog,
): Promise<{ id: string; targetUrl: string; status: "success" | "failed"; error?: string }> {
  const start = Date.now()
  try {
    const collected = await collectDouyinCompetitorData({
      targetUrl: account.targetUrl,
      platformUserId: account.platformUserId,
      count: 30,
    })

    const sortedVideos = [...collected.videos].sort(
      (a, b) => b.createTime - a.createTime,
    )
    const viralPicks = calculateViralVideos(sortedVideos)

    await prisma.watchAccount.update({
      where: { id: account.id, userId: account.userId },
      data: {
        platformUserId: collected.platformUserId,
        nickname: collected.account.nickname,
        avatar: collected.account.avatar,
        followerCount: collected.account.followerCount,
        latestVideos: collected.videos.slice(0, 20) as never,
        viralVideos: viralPicks as never,
        refreshStatus: "success",
        refreshError: null,
        lastRefreshedAt: new Date(),
      },
    })

    log.info({ accountId: account.id, elapsed: Date.now() - start }, "Account refreshed")
    return { id: account.id, targetUrl: account.targetUrl, status: "success" }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await prisma.watchAccount.update({
      where: { id: account.id, userId: account.userId },
      data: { refreshStatus: "failed", refreshError: errorMessage },
    })
    log.error({ accountId: account.id, err }, "Account refresh failed")
    return { id: account.id, targetUrl: account.targetUrl, status: "failed", error: errorMessage }
  }
}

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonBody(request, watchAccountRefreshBodySchema, { maxBytes: 1024 })

  const where = { userId: user.id }
  if (body.accountId) {
    ;(where as Record<string, unknown>).id = body.accountId
  }

  const accounts = await prisma.watchAccount.findMany({
    where: where as { userId: string; id?: string },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  if (accounts.length === 0) {
    return NextResponse.json({ error: "没有待刷新的账号" }, { status: 400 })
  }

  const quotaResponse = await enforceWatchRefreshBetaLimit(user.id, accounts.length)
  if (quotaResponse) return quotaResponse

  const requestId = request.headers.get("x-request-id") || generateRequestId()
  const log = logger.child({ requestId, userIdHash: hashLogIdentifier(user.id), accountIds: accounts.map((a) => a.id) })
  log.info(`Starting refresh for ${accounts.length} watch accounts`)

  await prisma.watchAccount.updateMany({
    where: { userId: user.id, id: { in: accounts.map((account) => account.id) } },
    data: { refreshStatus: "refreshing", refreshError: null },
  })

  const results = []
  for (const account of accounts) results.push(await refreshAccount(account, log))
  const success = results.filter((result) => result.status === "success").length
  const failed = results.length - success

  return NextResponse.json({
    results,
    summary: {
      total: results.length,
      success,
      failed,
    },
  }, { status: success > 0 ? 200 : 502, headers: { "x-request-id": requestId } })
})
