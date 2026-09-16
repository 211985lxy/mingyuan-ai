import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import {
  generateVideoThumbnailUrl,
  isManagedOssUrl,
  signOssUrls,
} from "@/lib/oss"
import { analyzeMarketing } from "@/lib/marketing-analysis"
import { LLMClient } from "@/lib/llm"
import { ACTIVE_VIDEO_TASK_STATUSES } from "@/lib/video-task-domain"

// ─── GET /api/tasks/[id] ────────────────────────────────

export const GET = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const task = await prisma.videoTask.findFirst({ where: { id, userId: user.id } })

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // If completed with video but no analysis yet, trigger it (non-blocking)
  if (task.status === "completed" && task.videoUrl && !task.marketingAnalysis) {
    triggerAnalysis(task.id, task.userId, task.scriptContent).catch((err) =>
      console.error(`[tasks/${id}] Analysis failed:`, err instanceof Error ? err.message : err)
    )
  }

  return NextResponse.json({
    data: signTaskUrls(await enrichTaskForResponse(task)),
  })
})

// ─── DELETE /api/tasks/[id] ─────────────────────────────
//
// 只删除任务记录，不动已转存到自有 OSS 的成片文件——避免误删用户资产。
// 生成中的任务不允许删除：供应商回调会落到已删记录，且此时计费已发生。

export const DELETE = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const task = await prisma.videoTask.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true },
  })

  // 幂等且不泄露存在性：不存在或不属于本人，一律按成功返回
  if (!task) {
    return NextResponse.json({ data: { deleted: false } })
  }

  if (ACTIVE_VIDEO_TASK_STATUSES.includes(task.status as (typeof ACTIVE_VIDEO_TASK_STATUSES)[number])) {
    return NextResponse.json(
      { error: "任务生成中，请等它完成或失败后再删除", code: "TASK_IN_PROGRESS" },
      { status: 409 },
    )
  }

  await prisma.videoTask.delete({ where: { id } })
  return NextResponse.json({ data: { deleted: true } })
})

// ─── Helpers ────────────────────────────────────────────

function signTaskUrls<T extends { videoUrl: string | null; coverUrl: string | null }>(task: T): T {
  // If no cover but video is on OSS, generate a thumbnail from the video
  const coverUrl = !task.coverUrl && task.videoUrl && isManagedOssUrl(task.videoUrl)
    ? generateVideoThumbnailUrl(task.videoUrl)
    : task.coverUrl;

  return signOssUrls({ ...task, coverUrl });
}

function parseTemplateTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
}

async function enrichTaskForResponse<T extends {
  userId: string
  scriptId: string | null
  sourceTemplateId?: string | null
}>(task: T): Promise<T & {
  hotTopic: string | null
  sourceTemplateId: string | null
  sourceTemplateTags: string[]
}> {
  if (!task.scriptId) {
    return {
      ...task,
      hotTopic: null,
      sourceTemplateId: task.sourceTemplateId ?? null,
      sourceTemplateTags: [],
    }
  }

  const script = await prisma.script.findUnique({
    where: { id: task.scriptId, userId: task.userId },
    select: {
      sourceTemplateId: true,
      generationRun: {
        select: {
          hotTopic: true,
        },
      },
    },
  })

  const sourceTemplateId = script?.sourceTemplateId ?? task.sourceTemplateId ?? null

  let sourceTemplateTags: string[] = []
  if (sourceTemplateId) {
    const template = await prisma.contentTemplate.findUnique({
      where: { id: sourceTemplateId },
      select: { tags: true },
    })
    sourceTemplateTags = parseTemplateTags(template?.tags)
  }

  return {
    ...task,
    hotTopic: script?.generationRun?.hotTopic ?? null,
    sourceTemplateId,
    sourceTemplateTags,
  }
}

const analysisInProgress = new Set<string>()

async function triggerAnalysis(taskId: string, userId: string, scriptContent: string) {
  if (!LLMClient.shared().available) return
  if (analysisInProgress.has(taskId)) return

  analysisInProgress.add(taskId)
  try {
    const analysis = await analyzeMarketing(scriptContent)
    await prisma.videoTask.update({
      where: { id: taskId, userId },
      data: { marketingAnalysis: JSON.parse(JSON.stringify(analysis)) },
    })
  } finally {
    analysisInProgress.delete(taskId)
  }
}
