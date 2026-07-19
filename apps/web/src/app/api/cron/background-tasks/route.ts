import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { reclaimExpiredBackgroundTaskLeases } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { COMPETITOR_ANALYSIS_TASK_KIND, executeCompetitorAnalysisBackgroundTask } from "@/lib/competitor-analysis/background-task"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const reclaimed = await reclaimExpiredBackgroundTaskLeases(prisma)
    const tasks = await prisma.backgroundTask.findMany({
      where: { kind: COMPETITOR_ANALYSIS_TASK_KIND, status: { in: ["queued", "retry_wait"] }, availableAt: { lte: new Date() } },
      select: { id: true },
      take: 20,
    })
    let executed = 0
    for (const task of tasks) if (await executeCompetitorAnalysisBackgroundTask(task.id)) executed += 1
    return NextResponse.json({ ok: true, reclaimed: reclaimed.count, ready: tasks.length, executed })
  } catch (error) {
    console.error("[cron/background-tasks] failed:", error)
    return NextResponse.json({ error: "后台任务恢复扫描失败" }, { status: 503 })
  }
}
