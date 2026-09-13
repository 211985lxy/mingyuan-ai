import { NextRequest, NextResponse } from "next/server"
import { authorizeCronJob } from "@/lib/aim/cron-job-guard"
import { prisma } from "@/lib/prisma"
import { purgeExpiredCodes } from "@/features/auth/sms-verification"
import { sweepStaleAimGenerations } from "@/lib/aim/generation-attempt"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  const denied = await authorizeCronJob(request, "cleanup")
  if (denied) return denied

  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    // aim-harness-v1: 删除到期 AimRunSnapshot（含完整 prompt/输出，30 天），
    // 但保留关联的 AimExecutionTrace 元数据（provider/model/哈希/指标）长期可查。
    const aimSnapshots = await (prisma as typeof prisma & {
      aimRunSnapshot?: { deleteMany(args: unknown): Promise<{ count: number }> }
    }).aimRunSnapshot?.deleteMany({
      where: { expiresAt: { lt: now } },
    })

    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
    const staleTraces = await (prisma as typeof prisma & {
      aimExecutionTrace?: { updateMany(args: unknown): Promise<{ count: number }> }
    }).aimExecutionTrace?.updateMany({
      where: { status: "running", updatedAt: { lt: tenMinutesAgo } },
      data: {
        status: "failed",
        errorCode: "STALE_EXECUTION",
        errorMessage: "执行超时未结束，已自动标记失败",
      },
    })
    const staleGenerations = await sweepStaleAimGenerations(now)

    const [hotItems, snapshots, expiredSmsCodes] = await Promise.all([
      prisma.douyinHotItem.deleteMany({
        where: { fetchedAt: { lt: thirtyDaysAgo } },
      }),
      prisma.douyinHotSnapshot.deleteMany({
        where: { fetchedAt: { lt: ninetyDaysAgo } },
      }),
      purgeExpiredCodes(),
    ])

    return NextResponse.json({
      ok: true,
      deleted: {
        hotItems: hotItems.count,
        snapshots: snapshots.count,
        aimSnapshots: aimSnapshots?.count ?? 0,
        expiredSmsCodes,
      },
      staleTraces: staleTraces?.count ?? 0,
      staleGenerations,
    })
  } catch (error) {
    console.error("[cron/cleanup] failed:", error)
    return NextResponse.json({ error: "清理任务失败" }, { status: 502 })
  }
}
