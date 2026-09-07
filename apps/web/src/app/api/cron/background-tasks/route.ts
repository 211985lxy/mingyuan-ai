import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { reclaimExpiredBackgroundTaskLeases } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { BACKGROUND_TASK_KINDS, executeBackgroundTaskBatch } from "@/lib/background-task-executors"
import { sweepStaleAimGenerations } from "@/lib/aim/generation-attempt"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    // 真实 systemd 调度命中的是 background-tasks 入口；在这里回收
    // execute 路径因断开/超时遗留的 running 任务，避免它们永久挡住同一任务重试。
    await sweepStaleAimGenerations()
    const reclaimed = await reclaimExpiredBackgroundTaskLeases(prisma)
    const tasks = await prisma.backgroundTask.findMany({
      where: { kind: { in: BACKGROUND_TASK_KINDS }, status: { in: ["queued", "retry_wait"] }, availableAt: { lte: new Date() } },
      select: { id: true, kind: true },
      orderBy: { availableAt: "asc" },
      take: 20,
    })
    const executed = await executeBackgroundTaskBatch(tasks, 4)
    return NextResponse.json({ ok: true, reclaimed: reclaimed.count, ready: tasks.length, executed })
  } catch (error) {
    console.error("[cron/background-tasks] failed:", error)
    return NextResponse.json({ error: "后台任务恢复扫描失败" }, { status: 503 })
  }
}
