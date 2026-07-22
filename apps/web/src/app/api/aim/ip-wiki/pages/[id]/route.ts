import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { updateIpWikiPage } from "@/lib/ip-wiki/repo"

export const maxDuration = 30

async function ensureProject(userId: string, projectId: string) {
  return prisma.clientProject.findFirst({
    where: { id: projectId, userId, status: "active" },
    select: { id: true },
  })
}

/**
 * PUT /api/aim/ip-wiki/pages/[id] —— 客户自助编辑某 active 维基页（人工确认后的维护入口）。
 *
 * 只允许改 title/content/frontmatter/links 四类可变字段；pageType/sources/sourceGenerationId
 * 不可变（不改类型、不改来源溯源）。命中后同 (projectId, pageType) 旧 active 归档、version+1，
 * 与批量写入语义一致，保证单一 active 不变量 + 完整审计轨迹。
 *
 * projectId 与 id 必须同时校验：projectId 走 ensureProject 归属校验，id 走 repo 内的
 * (id, projectId, userId, active) 锁定，双重鉴权防止越权改他人维基页。
 */
/**
 * @description 处理 PUT 请求
 * @param request - 请求对象
 * @param ctx - 路由上下文（含动态 id）
 * @returns 无返回值
 */
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await ctx.params
    const body = await parseJsonRecord(request)
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const title = typeof body.title === "string" ? body.title : undefined
    const content = typeof body.content === "string" ? body.content : undefined
    const frontmatter =
      body.frontmatter && typeof body.frontmatter === "object"
        ? (body.frontmatter as Record<string, unknown>)
        : undefined
    const links = Array.isArray(body.links) ? (body.links as string[]) : undefined

    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }
    if (title === undefined && content === undefined && frontmatter === undefined && links === undefined) {
      return NextResponse.json({ error: "至少提供 title/content/frontmatter/links 之一" }, { status: 400 })
    }
    if (title !== undefined && !title.trim()) {
      return NextResponse.json({ error: "title 不能为空" }, { status: 400 })
    }
    if (content !== undefined && !content.trim()) {
      return NextResponse.json({ error: "content 不能为空" }, { status: 400 })
    }

    const project = await ensureProject(user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: "IP营销全案不存在或已归档" }, { status: 404 })
    }

    const page = await updateIpWikiPage({
      userId: user.id,
      projectId,
      id,
      patch: { title, content, frontmatter, links },
    })
    if (!page) {
      return NextResponse.json({ error: "维基页不存在或已归档" }, { status: 404 })
    }

    return NextResponse.json({ page }, { status: 201 })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/ip-wiki/pages/[id] PUT] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "维基页更新失败" },
      { status: 500 },
    )
  }
}
