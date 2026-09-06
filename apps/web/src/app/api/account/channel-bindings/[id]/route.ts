import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { AIM_AGENT_IDS } from "@/lib/aim-harness/contracts"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

const VALID_AGENT_IDS = Array.from(AIM_AGENT_IDS)

const updateSchema = z.object({
  projectId: z.string().trim().min(1).max(80).optional(),
  triggerMode: z.enum(["mention_or_keyword", "all"]).optional(),
  triggerKeywords: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  executionMode: z.enum(["capture_only", "evaluate", "live"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  routeTarget: z.enum(["topic", "aim"]).optional(),
  defaultAgentId: z.enum(VALID_AGENT_IDS as [string, ...string[]]).optional().nullable(),
}).strict().refine((body) => Object.keys(body).length > 0, "至少提供一个更新字段")

/**
 * @description 处理 PATCH 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await parseJsonBody(request, updateSchema, { maxBytes: 8 * 1024 })
    const boundProject = await resolveBoundProject({ userId: user.id, requestedProjectId: body.projectId })
    const binding = await prisma.channelBinding.findFirst({ where: { id, userId: user.id, projectId: boundProject.id }, select: { id: true } })
    if (!binding) return NextResponse.json({ error: "群聊绑定不存在" }, { status: 404 })
    const updated = await prisma.channelBinding.update({
      where: { id },
      data: { ...body, projectId: boundProject.id },
      include: { project: { select: { id: true, name: true, status: true } } },
    })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json({ error: "群聊绑定更新失败" }, { status: 500 })
  }
}

/**
 * @description 处理 DELETE 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const boundProject = await resolveBoundProject({ userId: user.id })
    const result = await prisma.channelBinding.deleteMany({ where: { id, userId: user.id, projectId: boundProject.id } })
    if (result.count === 0) return NextResponse.json({ error: "群聊绑定不存在" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json({ error: "群聊绑定删除失败" }, { status: 500 })
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
