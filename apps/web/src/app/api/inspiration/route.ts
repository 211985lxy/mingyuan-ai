import { parseJsonRecord } from "@/lib/api-contract"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { areBackgroundTasksEnabled } from "@/lib/background-task-runtime"
import { INSPIRATION_PROCESS_TASK_KIND } from "@/features/topics/services/inspiration-background-task"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { NextRequest, NextResponse } from "next/server"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const url = new URL(request.url)
    const status = url.searchParams.get("status")
    const requestedProjectId = url.searchParams.get("projectId")?.trim() || undefined
    if (requestedProjectId && requestedProjectId.length > 80) {
      return NextResponse.json({ error: "项目标识过长" }, { status: 400 })
    }
    const project = await resolveBoundProject({ userId: user.id, requestedProjectId })
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)))
    const items = await prisma.inspiration.findMany({ where: { userId: user.id, projectId: project.id, ...(status ? { aiStatus: status } : {}) }, orderBy: { createdAt: "desc" }, take: limit })
    return NextResponse.json({ items })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "灵感列表读取失败" }, { status: 500 })
  }
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)
    const content = typeof body.content === "string" ? body.content.trim() : ""
    const source = typeof body.source === "string" ? body.source.trim() : "text"
    const requestedProjectId = typeof body.projectId === "string" ? body.projectId.trim() : undefined
    const autoProcess = body.autoProcess !== false
    if (!content) return NextResponse.json({ error: "灵感内容不能为空" }, { status: 400 })
    if (content.length > 10_000) return NextResponse.json({ error: "灵感内容过长，请控制在 10000 字以内" }, { status: 400 })
    if (requestedProjectId && requestedProjectId.length > 80) return NextResponse.json({ error: "项目标识过长" }, { status: 400 })
    const project = await resolveBoundProject({ userId: user.id, requestedProjectId })
    if (autoProcess && !areBackgroundTasksEnabled()) {
      return NextResponse.json({ error: "BACKGROUND_TASKS_UNAVAILABLE" }, { status: 503 })
    }
    const inspiration = await prisma.$transaction(async (tx) => {
      const created = await tx.inspiration.create({ data: { userId: user.id, projectId: project.id, source, content, aiStatus: autoProcess ? "pending" : "completed" } })
      if (autoProcess) await enqueueBackgroundTask(tx as never, { kind: INSPIRATION_PROCESS_TASK_KIND, aggregateType: "inspiration", aggregateId: created.id, idempotencyKey: `inspiration:${created.id}` })
      return created
    })
    return NextResponse.json(inspiration, { status: 201 })
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json({ error: "灵感保存失败" }, { status: 500 })
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
