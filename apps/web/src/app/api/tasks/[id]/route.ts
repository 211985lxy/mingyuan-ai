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

// ─── GET /api/tasks/[id] ────────────────────────────────

export const GET = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const task = await prisma.videoTask.findUnique({ where: { id } })

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (task.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // If completed with video but no analysis yet, trigger it (non-blocking)
  if (task.status === "completed" && task.videoUrl && !task.marketingAnalysis) {
    triggerAnalysis(task.id, task.scriptContent).catch((err) =>
      console.error(`[tasks/${id}] Analysis failed:`, err instanceof Error ? err.message : err)
    )
  }

  return NextResponse.json({
    data: signTaskUrls(await enrichTaskForResponse(task)),
  })
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
    where: { id: task.scriptId },
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

async function triggerAnalysis(taskId: string, scriptContent: string) {
  if (!LLMClient.shared().available) return
  if (analysisInProgress.has(taskId)) return

  analysisInProgress.add(taskId)
  try {
    const analysis = await analyzeMarketing(scriptContent)
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { marketingAnalysis: JSON.parse(JSON.stringify(analysis)) },
    })
  } finally {
    analysisInProgress.delete(taskId)
  }
}
