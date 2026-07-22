import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/content-opportunities/collections/:id/create-work-item
 * 基于研究结果创建 AIM 经营事项（复用现有 AimGeneration 状态机）
 */
export const POST = withUserAuth(async (request, { user, params }) => {
  const { id } = await params

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id },
  })

  if (!collection) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  const analysis = collection.analysisResult as Record<string, unknown> | null
  const items = collection.items as unknown as Array<{ title?: string; platform?: string; sourceUrl?: string }>

  // Build a concise brief from the analysis
  const topics = (analysis?.candidateTopics as Array<{ title: string }>) ?? []
  const topicSummary = topics.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`).join("\n")

  const rawInput = [
    `[内容机会研究] 基于 ${Array.isArray(items) ? items.length : 0} 条爆款样本的研究`,
    collection.name ? `研究篮：${collection.name}` : "",
    topicSummary ? `候选选题：\n${topicSummary}` : "",
    "请基于以上研究结论，为当前客户项目创作原创内容。",
  ].filter(Boolean).join("\n\n")

  // Create AimGeneration as work item (reuses existing state machine)
  const generation = await prisma.aimGeneration.create({
    data: {
      userId: user.id,
      projectId: collection.projectId,
      agentId: "content_producer",
      rawInput,
      workflowStatus: "draft",
      taskSpec: {
        source: "content_opportunity",
        collectionId: id,
        sampleCount: Array.isArray(items) ? items.length : 0,
        analysisStatus: collection.status,
      },
      status: "pending",
    },
  })

  return NextResponse.json({
    generationId: generation.id,
    workflowStatus: generation.workflowStatus,
    message: "经营事项已创建，可前往 AIM 创作推进",
  }, { status: 201 })
})
