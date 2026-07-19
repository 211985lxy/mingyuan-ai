import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { reclaimExpiredBackgroundTaskLeases } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const reclaimed = await reclaimExpiredBackgroundTaskLeases(prisma)
    const ready = await prisma.backgroundTask.count({
      where: { status: { in: ["queued", "retry_wait"] }, availableAt: { lte: new Date() } },
    })
    return NextResponse.json({ ok: true, reclaimed: reclaimed.count, ready, executed: 0 })
  } catch (error) {
    console.error("[cron/background-tasks] failed:", error)
    return NextResponse.json({ error: "后台任务恢复扫描失败" }, { status: 503 })
  }
}
