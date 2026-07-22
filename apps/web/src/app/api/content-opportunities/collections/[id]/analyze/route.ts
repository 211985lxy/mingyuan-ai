import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { enqueueBackgroundTask } from "@/lib/background-tasks"

/**
 * POST /api/content-opportunities/collections/:id/analyze
 * 触发 GLM-5.2 批量研究分析（异步后台任务）
 */
export const POST = withUserAuth(async (_request, { user, params }) => {
  const { id } = await params

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id },
  })

  if (!collection) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  if (collection.status === "analyzing") {
    return NextResponse.json({ error: "分析正在进行中，请稍候" }, { status: 409 })
  }

  const items = collection.items as unknown as unknown[]
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "研究篮中没有样本" }, { status: 400 })
  }

  // Update status and enqueue background task
  await prisma.opportunityCollection.update({
    where: { id },
    data: { status: "analyzing", analysisError: null },
  })

  const task = await enqueueBackgroundTask(prisma, {
    kind: "opportunity_analyze",
    aggregateType: "OpportunityCollection",
    aggregateId: id,
    idempotencyKey: `opp_analyze:${id}:${Date.now()}`,
    maxAttempts: 3,
  })

  await prisma.opportunityCollection.update({
    where: { id },
    data: { backgroundTaskId: task.id },
  })

  return NextResponse.json({
    ok: true,
    taskId: task.id,
    status: "analyzing",
    message: "分析任务已提交，预计 30-60 秒完成",
  })
})
