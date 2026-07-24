import {
  claimBackgroundTask,
  completeBackgroundTask,
  failBackgroundTask,
  planBackgroundTaskFailure,
} from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { generateAimContent } from "@/lib/aim-generator"
import {
  buildSourceBrief,
  formatSourceBriefSummary,
  getMaterialAnchorsFromTaskSpec,
} from "@/features/newsroom/services/build-source-brief"
import { buildTaskSpecSkeleton, type TaskSpec } from "@/lib/task-spec"
import { parseEditorReviseOutput } from "@/lib/aim-agent-content-review-prompts"
import type { NewsroomStage } from "@/features/newsroom/contracts"
import type { Prisma } from "@/generated/prisma/client"

export const NEWSROOM_PIPELINE_TASK_KIND = "newsroom_pipeline"

function asJson(taskSpec: TaskSpec): Prisma.InputJsonValue {
  return taskSpec as unknown as Prisma.InputJsonValue
}

function mergeNewsroom(taskSpec: TaskSpec | null | undefined, patch: {
  stage: NewsroomStage
  collectionId?: string
  sourceCount?: number
  generationId?: string
  editorDiffSummary?: string
  pipelineTaskId?: string
}): TaskSpec {
  const base = taskSpec ?? buildTaskSpecSkeleton({
    rawInput: "编辑室流水线",
    project: null,
    topicSelection: null,
    knowledgeTitles: [],
  })
  return {
    ...base,
    newsroom: {
      ...(base.newsroom ?? {}),
      ...patch,
      collectionId: patch.collectionId ?? base.newsroom?.collectionId ?? base.collectionId,
      sourceCount: patch.sourceCount ?? base.newsroom?.sourceCount ?? base.sampleCount,
    },
  }
}

/**
 * 一键编辑室：brief ready → content_producer → editor_revise → 写回 AimGeneration
 * aggregateId = AimGeneration.id
 */
export async function executeNewsroomPipelineBackgroundTask(taskId: string): Promise<boolean> {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  try {
    await runNewsroomPipeline(task.aggregateId, task.id)
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const plan = planBackgroundTaskFailure({
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable: !message.includes("研究篮") && !message.includes("样本"),
      now: new Date(),
    })
    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable: plan.status !== "failed",
      error: message,
    })

    try {
      const existing = await prisma.aimGeneration.findUnique({
        where: { id: task.aggregateId },
        select: { taskSpec: true },
      })
      const taskSpec = existing?.taskSpec && typeof existing.taskSpec === "object"
        ? mergeNewsroom(existing.taskSpec as unknown as TaskSpec, { stage: "failed", pipelineTaskId: task.id })
        : undefined
      if (taskSpec) {
        await prisma.aimGeneration.update({
          where: { id: task.aggregateId },
          data: { taskSpec: asJson(taskSpec), status: "failed" },
        })
      }
    } catch {
      // ignore secondary failure
    }
    return true
  }
}

export async function runNewsroomPipeline(generationId: string, pipelineTaskId?: string): Promise<void> {
  const generation = await prisma.aimGeneration.findUnique({ where: { id: generationId } })
  if (!generation) throw new Error("经营事项不存在")

  let taskSpec = (generation.taskSpec && typeof generation.taskSpec === "object" && !Array.isArray(generation.taskSpec)
    ? generation.taskSpec as unknown as TaskSpec
    : null)

  let brief = getMaterialAnchorsFromTaskSpec(taskSpec)
  const collectionId = taskSpec?.collectionId || taskSpec?.newsroom?.collectionId

  if ((!brief || brief.samples.length === 0) && collectionId) {
    const collection = await prisma.opportunityCollection.findUnique({ where: { id: collectionId } })
    if (!collection) throw new Error("研究篮不存在")
    brief = buildSourceBrief({
      collectionId: collection.id,
      collectionName: collection.name,
      items: collection.items,
      analysisResult: collection.analysisResult,
    })
    if (brief.samples.length === 0) throw new Error("研究篮没有可用样本")
    const skeleton = taskSpec ?? buildTaskSpecSkeleton({
      rawInput: formatSourceBriefSummary(brief),
      project: null,
      topicSelection: null,
      knowledgeTitles: [],
    })
    taskSpec = {
      ...skeleton,
      materialAnchors: brief,
      source: "content_opportunity",
      collectionId: collection.id,
      sampleCount: brief.samples.length,
      newsroom: {
        stage: "writing_ready",
        collectionId: collection.id,
        sourceCount: brief.samples.length,
        generationId,
        pipelineTaskId,
      },
    }
    await prisma.aimGeneration.update({
      where: { id: generationId },
      data: {
        rawInput: formatSourceBriefSummary(brief),
        taskSpec: asJson(taskSpec),
      },
    })
  }

  if (!brief || brief.samples.length === 0) {
    throw new Error("缺少样本锚点，无法进入编辑室写作")
  }

  // Stage: writing
  taskSpec = mergeNewsroom(taskSpec, {
    stage: "writing",
    collectionId: brief.collectionId,
    sourceCount: brief.samples.length,
    generationId,
    pipelineTaskId,
  })
  await prisma.aimGeneration.update({
    where: { id: generationId },
    data: { taskSpec: asJson(taskSpec), status: "pending" },
  })

  const draft = await generateAimContent({
    userId: generation.userId,
    projectId: generation.projectId || undefined,
    agentId: "content_producer",
    rawInput: generation.rawInput || formatSourceBriefSummary(brief),
    targetFormats: ["video_script", "moments_post"],
    taskType: "write_script",
    existingGenerationId: generationId,
    taskSpec,
  })

  const draftContent = draft.results.find((r) => r.format === "video_script")?.content
    || draft.results[0]?.content
    || ""
  if (!draftContent.trim()) throw new Error("Writer 未产出初稿")

  // Stage: editing
  taskSpec = mergeNewsroom(taskSpec, {
    stage: "editing",
    collectionId: brief.collectionId,
    sourceCount: brief.samples.length,
    generationId,
    pipelineTaskId,
  })
  await prisma.aimGeneration.update({
    where: { id: generationId },
    data: { taskSpec: asJson(taskSpec) },
  })

  const edited = await generateAimContent({
    userId: generation.userId,
    projectId: generation.projectId || undefined,
    agentId: "content_review",
    rawInput: draftContent,
    targetFormats: ["raw_copy"],
    taskType: "quality_check",
    reviewMode: "editor_revise",
    existingGenerationId: generationId,
    taskSpec,
  })

  const parsed = parseEditorReviseOutput(edited.results[0]?.content || "")
  if (parsed.requestRewrite || !parsed.finalContent.trim()) {
    throw new Error(parsed.diffSummary || "主编打回重写")
  }

  taskSpec = mergeNewsroom(taskSpec, {
    stage: "done",
    collectionId: brief.collectionId,
    sourceCount: brief.samples.length,
    generationId,
    pipelineTaskId,
    editorDiffSummary: parsed.diffSummary,
  })

  await prisma.aimGeneration.update({
    where: { id: generationId },
    data: {
      videoScript: parsed.finalContent,
      rawCopy: edited.results[0]?.content || parsed.finalContent,
      taskSpec: asJson(taskSpec),
      status: "completed",
      agentId: "content_producer",
    },
  })
}
