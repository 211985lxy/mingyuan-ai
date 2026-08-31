import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { createVideoTask } from "@/lib/video-task-request/service"
import { VideoTaskRequestError } from "@/lib/video-task-request/contracts"

/**
 * 管理员人工确认后，才允许把失败的蝉镜任务转为闪剪备用任务。
 * 原任务和外部任务编号保持不变，新任务通过 retryOfTaskId 关联。
 */
export const POST = withAdminOnly(async (request, { params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const body = await parseJsonRecord(request)
  if (body.provider !== "shanjian" || body.confirm !== true) {
    return NextResponse.json(
      {
        error: "切换闪剪前必须明确确认。第一阶段不会自动切换供应商。",
        code: "PROVIDER_SWITCH_CONFIRMATION_REQUIRED",
      },
      { status: 400 },
    )
  }

  const task = await prisma.videoTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (task.status !== "failed") {
    return NextResponse.json({ error: "只有失败的视频任务才能切换备用供应商" }, { status: 422 })
  }

  const retryPayload: Record<string, unknown> = {
    type: task.videoType,
    projectId: task.projectId ?? undefined,
    aimGenerationId: task.aimGenerationId ?? undefined,
    avatarId: task.avatarId ?? undefined,
    scriptContent: task.scriptContent,
    avatarName: task.avatarName,
    actionId: `admin-fallback:${task.id}:${Date.now()}`,
    retryOfTaskId: task.id,
  }
  if (task.shanjianPayload && typeof task.shanjianPayload === "object") {
    const payload = task.shanjianPayload as Record<string, unknown>
    if (payload.styleId) retryPayload.styleId = payload.styleId
    if (payload.speakerExtra) retryPayload.speakerExtra = payload.speakerExtra
    if (payload.processRules) retryPayload.processRules = payload.processRules
    if (payload.aspectRatio === "16:9" || payload.aspectRatio === "9:16") {
      retryPayload.aspectRatio = payload.aspectRatio
    }
  }

  try {
    const result = await createVideoTask(task.userId, retryPayload, {
      provider: "shanjian",
      retryOfTaskId: task.id,
    })
    return NextResponse.json(
      {
        data: result.data,
        fallback: {
          provider: "shanjian",
          originalTaskId: task.id,
          warning: "闪剪是人工备用供应商，可能产生额外服务费用；原蝉镜任务不会被重新提交。",
        },
      },
      { status: result.status },
    )
  } catch (error) {
    if (error instanceof VideoTaskRequestError) {
      return NextResponse.json({ error: error.message, ...error.details }, { status: error.status })
    }
    throw error
  }
})
