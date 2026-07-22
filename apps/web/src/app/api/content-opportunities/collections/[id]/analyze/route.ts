import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { areBackgroundTasksEnabled } from "@/lib/background-task-runtime"
import { OPPORTUNITY_ANALYZE_TASK_KIND } from "@/features/opportunities/services/analyze-background-task"

/**
 * POST /api/content-opportunities/collections/[id]/analyze
 * 触发 AI 批量分析（后台任务）
 */
export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params!.id

  if (!areBackgroundTasksEnabled()) {
    return NextResponse.json({ error: "BACKGROUND_TASKS_UNAVAILABLE" }, { status: 503 })
  }

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id },
  })

  if (!collection) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  if (collection.status === "analyzing") {
    return NextResponse.json({ error: "分析正在进行中" }, { status: 409 })
  }

  // 更新状态为 analyzing
  await prisma.opportunityCollection.update({
    where: { id },
    data: { status: "analyzing", analysisError: null },
  })

  // 入队后台任务
  const task = await enqueueBackgroundTask(prisma, {
    kind: OPPORTUNITY_ANALYZE_TASK_KIND,
    aggregateType: "OpportunityCollection",
    aggregateId: id,
    idempotencyKey: `opp-analyze:${id}:${Date.now()}`,
    maxAttempts: 2,
  })

  await prisma.opportunityCollection.update({
    where: { id },
    data: { backgroundTaskId: task.id },
  })

  return NextResponse.json({ taskId: task.id, status: "analyzing" })
})
