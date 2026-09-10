import { parseJsonBody, parseQuery } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { extractAndPersistForEntry } from "@/lib/knowledge-entity-extractor"
import { buildDefaultKnowledgeTags, mergeKnowledgeTags, normalizeValueGrade } from "@/lib/knowledge-tags"
import { enforceKnowledgeBetaLimit } from "@/lib/internal-beta-limits"
import {
  knowledgeCreateBodySchema,
  knowledgeListQuerySchema,
} from "@/features/knowledge/contracts/api"
import {
  AccountProjectContextError,
  resolveBoundProject,
} from "@/lib/account-project-context"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const { category, status, projectId, page = 1, pageSize = 50 } = parseQuery(
      request,
      knowledgeListQuerySchema,
    )
    const boundProject = await resolveBoundProject({
      userId: user.id,
      requestedProjectId: projectId,
    })

    const entries = await prisma.knowledgeEntry.findMany({
      where: {
        projectId: boundProject.id,
        status,
        ...(category ? { category } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json(entries)
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "知识库读取失败" },
      { status: 500 }
    )
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
    const body = await parseJsonBody(request, knowledgeCreateBodySchema, { maxBytes: 64 * 1024 })
    const { category, title, content, tags, sourceType, projectId, valueGrade } = body
    const boundProject = await resolveBoundProject({
      userId: user.id,
      requestedProjectId: projectId,
    })

    if (!category || !title || !content) {
      return NextResponse.json(
        { error: "category, title, content 必填" },
        { status: 400 }
      )
    }

    const limitResponse = await enforceKnowledgeBetaLimit({ userId: user.id, projectId: boundProject.id })
    if (limitResponse) return limitResponse

    const entry = await prisma.knowledgeEntry.create({
      data: {
        userId: user.id,
        projectId: boundProject.id,
        category,
        title,
        content,
        tags: mergeKnowledgeTags(tags, buildDefaultKnowledgeTags(category)),
        sourceType: sourceType || "manual",
        valueGrade: normalizeValueGrade(valueGrade),
      },
    })

    // Fire-and-forget: generate embedding + extract entities/relations for the new entry
    ensureKnowledgeEmbedding(entry.id).catch(() => {})
    extractAndPersistForEntry(entry.id, content, { userId: user.id, projectId: boundProject.id }).catch(() => {})

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "知识创建失败" },
      { status: 500 }
    )
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
