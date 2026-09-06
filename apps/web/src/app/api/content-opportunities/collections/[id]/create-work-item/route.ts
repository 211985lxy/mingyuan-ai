import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { buildTaskSpecSkeleton } from "@/lib/task-spec"
import {
  buildSourceBrief,
  formatSourceBriefSummary,
} from "@/features/newsroom/services/build-source-brief"
import type { Prisma } from "@/generated/prisma/client"
import { resolveBoundProject } from "@/lib/account-project-context"

/**
 * POST /api/content-opportunities/collections/:id/create-work-item
 * 基于研究结果创建 AIM 经营事项（写入 materialAnchors + newsroom.stage）
 */
export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少研究篮 ID" }, { status: 400 })
  }

  const project = await resolveBoundProject({ userId: user.id })

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id, projectId: project.id },
  })

  if (!collection) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  const brief = buildSourceBrief({
    collectionId: id,
    collectionName: collection.name,
    items: collection.items,
    analysisResult: collection.analysisResult,
  })

  const rawInput = formatSourceBriefSummary(brief)
  const skeleton = buildTaskSpecSkeleton({
    rawInput,
    project: null,
    knowledgeTitles: [],
    topicSelection: brief.candidateTopics[0]
      ? {
          rationale: brief.candidateTopics[0].rationale,
          title: brief.candidateTopics[0].title,
          sourceHighlights: brief.samples.slice(0, 4).map((s) => ({
            category: s.platform,
            title: s.title,
            content: `[样本${s.index}] ${s.title}`,
          })),
        }
      : null,
  })

  const taskSpec = {
    ...skeleton,
    materialAnchors: brief,
    newsroom: {
      stage: "writing_ready" as const,
      collectionId: id,
      sourceCount: brief.samples.length,
    },
    source: "content_opportunity",
    collectionId: id,
    sampleCount: brief.samples.length,
    analysisStatus: collection.status,
  }

  const generation = await prisma.aimGeneration.create({
    data: {
      userId: user.id,
      projectId: project.id,
      agentId: "content_producer",
      rawInput,
      workflowStatus: "draft",
      taskSpec: taskSpec as unknown as Prisma.InputJsonValue,
      status: "pending",
    },
  })

  return NextResponse.json({
    generationId: generation.id,
    workflowStatus: generation.workflowStatus,
    sampleCount: brief.samples.length,
    message: "经营事项已创建，可前往 AIM 创作推进",
  }, { status: 201 })
})
