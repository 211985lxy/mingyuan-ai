import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { withUserAuth } from "@/lib/user-auth"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { createVideoTask } from "@/lib/video-task-request/service"
import { VideoTaskRequestError } from "@/lib/video-task-request/contracts"
import { normalizeDigitalHumanProvider } from "@/lib/digital-human-provider"

// ─── POST /api/tasks/[id]/retry ───────────────────────
// Create a new video task from a failed one, reusing the same parameters.

export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const task = await prisma.videoTask.findFirst({ where: { id, userId: user.id } })

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (task.status !== "failed") {
    return NextResponse.json(
      { error: "只有失败的视频任务才能重试" },
      { status: 422 },
    )
  }

  // Idempotent lock: prevent duplicate retries within 120s (no finally delete — let TTL expire)
  const lockKey = `task:retry:${task.id}`
  const locked = await redis.set(lockKey, "1", "EX", 120, "NX")
  if (!locked) {
    return NextResponse.json(
      { error: "您的重试请求正在处理中，请勿重复操作" },
      { status: 409 },
    )
  }

  const requestId = `task-retry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  console.log(`[${requestId}] Video task retry initiated for ${task.id} by user ${user.id}`)

  const limitResponse = await enforceDailyBetaLimit(user.id, "video_task")
  if (limitResponse) return limitResponse

  // Rebuild from the immutable snapshot. Do not pass scriptId: a retry must
  // use the exact text that was originally submitted, even if the source
  // script has since been edited.
  const retryPayload: Record<string, unknown> = {
    type: task.videoType,
    scriptContent: task.scriptContent,
    avatarName: task.avatarName,
    projectId: task.projectId ?? undefined,
    aimGenerationId: task.aimGenerationId ?? undefined,
    actionId: `retry:${task.id}:${Date.now()}`,
    retryOfTaskId: task.id,
  }

  if (task.avatarId) {
    retryPayload.avatarId = task.avatarId
  }

  // Re-use the recorded payload only for provider-neutral optional inputs.
  if (task.shanjianPayload && typeof task.shanjianPayload === "object") {
    const sp = task.shanjianPayload as Record<string, unknown>
    if (sp.virtualmanId) retryPayload.virtualmanId = sp.virtualmanId
    if (sp.speakerId) retryPayload.speakerId = sp.speakerId
    if (sp.styleId) retryPayload.styleId = sp.styleId
    if (sp.speakerExtra) retryPayload.speakerExtra = sp.speakerExtra
    if (sp.processRules) retryPayload.processRules = sp.processRules
    if (sp.aspectRatio === "16:9" || sp.aspectRatio === "9:16") retryPayload.aspectRatio = sp.aspectRatio
  }

  try {
    const result = await createVideoTask(
      user.id,
      retryPayload,
      {
        provider: normalizeDigitalHumanProvider(task.provider),
        retryOfTaskId: task.id,
      },
    )
    return NextResponse.json({ data: result.data }, { status: result.status })
  } catch (error) {
    if (error instanceof VideoTaskRequestError) {
      return NextResponse.json({ error: error.message, ...error.details }, { status: error.status })
    }
    throw error
  }
})
