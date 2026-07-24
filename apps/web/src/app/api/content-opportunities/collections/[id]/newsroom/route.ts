import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { areBackgroundTasksEnabled } from "@/lib/background-task-runtime"
import { buildTaskSpecSkeleton } from "@/lib/task-spec"
import {
  buildSourceBrief,
  formatSourceBriefSummary,
} from "@/features/newsroom/services/build-source-brief"
import { NEWSROOM_PIPELINE_TASK_KIND } from "@/features/newsroom/services/newsroom-pipeline-task"
import type { Prisma } from "@/generated/prisma/client"

/**
 * POST /api/content-opportunities/collections/:id/newsroom
 * 一键交给编辑室：建 AimGeneration（含 materialAnchors）并入队 newsroom_pipeline
 */
export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少研究篮 ID" }, { status: 400 })
  }

  if (!areBackgroundTasksEnabled()) {
    return NextResponse.json({ error: "BACKGROUND_TASKS_UNAVAILABLE" }, { status: 503 })
  }

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id },
  })

  if (!collection) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  if (collection.status !== "analyzed") {
    return NextResponse.json({ error: "请先完成研究篮分析" }, { status: 409 })
  }

  const brief = buildSourceBrief({
    collectionId: id,
    collectionName: collection.name,
    items: collection.items,
    analysisResult: collection.analysisResult,
  })

  if (brief.samples.length === 0) {
    return NextResponse.json({ error: "研究篮没有可用样本" }, { status: 400 })
  }

  const rawInput = formatSourceBriefSummary(brief)
  const skeleton = buildTaskSpecSkeleton({
    rawInput,
    project: null,
    knowledgeTitles: [],
    topicSelection: brief.candidateTopics[0]
      ? {
          title: brief.candidateTopics[0].title,
          rationale: brief.candidateTopics[0].rationale,
          sourceHighlights: brief.samples.slice(0, 4).map((s) => ({
            category: s.platform,
            title: s.title,
            content: `[样本${s.index}] ${s.title}`,
          })),
        }
      : null,
  })

  const taskSpecPayload = {
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
      projectId: collection.projectId,
      agentId: "content_producer",
      rawInput,
      workflowStatus: "draft",
      taskSpec: taskSpecPayload as unknown as Prisma.InputJsonValue,
      status: "pending",
    },
  })

  const task = await enqueueBackgroundTask(prisma, {
    kind: NEWSROOM_PIPELINE_TASK_KIND,
    aggregateType: "AimGeneration",
    aggregateId: generation.id,
    idempotencyKey: `newsroom:${generation.id}`,
    maxAttempts: 2,
  })

  await prisma.aimGeneration.update({
    where: { id: generation.id },
    data: {
      taskSpec: {
        ...taskSpecPayload,
        newsroom: {
          stage: "writing" as const,
          collectionId: id,
          sourceCount: brief.samples.length,
          generationId: generation.id,
          pipelineTaskId: task.id,
        },
      } as unknown as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({
    generationId: generation.id,
    taskId: task.id,
    sampleCount: brief.samples.length,
    message: "已交给编辑室，正在搜→写→改",
  }, { status: 201 })
})
