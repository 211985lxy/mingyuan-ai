import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { extractAndPersistForEntry } from "@/lib/knowledge-entity-extractor"
import { knowledgeUpdateBodySchema } from "@/features/knowledge/contracts/api"

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
    const body = await parseJsonBody(request, knowledgeUpdateBodySchema, { maxBytes: 64 * 1024 })

    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, userId: user.id },
    })
    if (!entry) {
      return NextResponse.json({ error: "不存在" }, { status: 404 })
    }

    const updated = await prisma.knowledgeEntry.update({
      where: { id, userId: user.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.tags !== undefined ? { tags: Array.isArray(body.tags) ? body.tags : [] } : {}),
      },
    })

    // Fire-and-forget: re-embed + re-extract entities when content changes
    if (body.content !== undefined) {
      ensureKnowledgeEmbedding(id).catch(() => {})
      extractAndPersistForEntry(id, body.content, {
        userId: user.id,
        projectId: entry.projectId || null,
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (error) {
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

    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id, userId: user.id },
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
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "知识归档失败" },
      { status: 500 }
    )
  }
}
