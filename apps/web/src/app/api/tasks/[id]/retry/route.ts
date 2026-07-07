import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { withUserAuth } from "@/lib/user-auth"

// ─── POST /api/tasks/[id]/retry ───────────────────────
// Create a new video task from a failed one, reusing the same parameters.

export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const task = await prisma.videoTask.findUnique({ where: { id } })

  if (!task || task.userId !== user.id) {
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

  // Build the body to re-submit to POST /api/tasks via internal redirect
  // We store enough context in the original task to rebuild the request
  const retryPayload: Record<string, unknown> = {
    type: task.videoType,
    scriptContent: task.scriptContent,
    avatarName: task.avatarName,
  }

  if (task.avatarId) {
    retryPayload.avatarId = task.avatarId
  }

  if (task.scriptId) {
    retryPayload.scriptId = task.scriptId
  }

  // Re-use shanjianPayload for extra params (speakerId, virtualmanId, etc.)
  if (task.shanjianPayload && typeof task.shanjianPayload === "object") {
    const sp = task.shanjianPayload as Record<string, unknown>
    if (sp.virtualmanId) retryPayload.virtualmanId = sp.virtualmanId
    if (sp.speakerId) retryPayload.speakerId = sp.speakerId
    if (sp.styleId) retryPayload.styleId = sp.styleId
    if (sp.speakerExtra) retryPayload.speakerExtra = sp.speakerExtra
    if (sp.processRules) retryPayload.processRules = sp.processRules
  }

  // Return the retry payload for the frontend to re-submit via createVideoTask
  // This avoids duplicating all the complex task creation logic
  return NextResponse.json({
    data: {
      retryPayload,
      originalTaskId: task.id,
    },
  })
})
