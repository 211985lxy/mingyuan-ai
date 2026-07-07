import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    const [hotItems, snapshots] = await Promise.all([
      prisma.douyinHotItem.deleteMany({
        where: { fetchedAt: { lt: thirtyDaysAgo } },
      }),
      prisma.douyinHotSnapshot.deleteMany({
        where: { fetchedAt: { lt: ninetyDaysAgo } },
      }),
    ])

    return NextResponse.json({
      ok: true,
      deleted: {
        hotItems: hotItems.count,
        snapshots: snapshots.count,
      },
    })
  } catch (error) {
    console.error("[cron/cleanup] failed:", error)
    return NextResponse.json({ error: "清理任务失败" }, { status: 502 })
  }
}
