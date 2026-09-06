import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { extractAndPersistForEntry } from "@/lib/knowledge-entity-extractor"
import { knowledgeUpdateBodySchema } from "@/features/knowledge/contracts/api"
import {
  AccountProjectContextError,
  resolveBoundProject,
} from "@/lib/account-project-context"

/**
 * @description 读取单条知识条目（工作台原文预览）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const boundProject = await resolveBoundProject({ userId: user.id })
    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, userId: user.id, projectId: boundProject.id },
    })
    if (!entry) {
      return NextResponse.json({ error: "不存在" }, { status: 404 })
    }
    return NextResponse.json(entry)
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "知识读取失败" },
      { status: 500 }
    )
  }
}

/**
 * @description 处理 PUT 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const boundProject = await resolveBoundProject({ userId: user.id })
    const body = await parseJsonBody(request, knowledgeUpdateBodySchema, { maxBytes: 64 * 1024 })

    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, userId: user.id, projectId: boundProject.id },
    })
    if (!entry) {
      return NextResponse.json({ error: "不存在" }, { status: 404 })
    }

    let nextProjectId: string | null | undefined = boundProject.id
    if (body.projectId !== undefined) {
      if (body.projectId === null || body.projectId === "") {
        return NextResponse.json({ error: "知识条目必须归属账号绑定项目", code: "PROJECT_CONTEXT_MISMATCH" }, { status: 409 })
      } else {
        const project = await resolveBoundProject({
          userId: user.id,
          requestedProjectId: body.projectId,
        })
        nextProjectId = project.id
      }
    }

    const updated = await prisma.knowledgeEntry.update({
      where: { id, userId: user.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.tags !== undefined ? { tags: Array.isArray(body.tags) ? body.tags : [] } : {}),
        ...(nextProjectId !== undefined ? { projectId: nextProjectId } : {}),
      },
    })

    // Fire-and-forget: re-embed + re-extract entities when content changes
    if (body.content !== undefined) {
      ensureKnowledgeEmbedding(id).catch(() => {})
      extractAndPersistForEntry(id, body.content, {
        userId: user.id,
        projectId: nextProjectId || boundProject.id,
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "知识更新失败" },
      { status: 500 }
    )
  }
}

/**
 * @description 处理 DELETE 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const boundProject = await resolveBoundProject({ userId: user.id })

    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, userId: user.id, projectId: boundProject.id },
    })
    if (!entry) {
      return NextResponse.json({ error: "不存在" }, { status: 404 })
    }

    await prisma.knowledgeEntry.update({
      where: { id, userId: user.id },
      data: { status: "archived" },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "知识归档失败" },
      { status: 500 }
    )
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
