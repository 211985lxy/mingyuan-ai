import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { env } from "@/env"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { obsidianSyncBodySchema } from "@/features/knowledge/contracts/api"
import { isKnowledgeCategory } from "@/lib/knowledge-categories"
import { safeSecretEqual } from "@/lib/aim/work-item-api-auth"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  const syncToken = env.OBSIDIAN_SYNC_TOKEN
  const targetUserId = env.OBSIDIAN_SYNC_USER_ID
  if (!syncToken || !targetUserId) {
    console.error("[knowledge/sync] 同步令牌或绑定用户未配置,拒绝请求")
    return NextResponse.json(
      { error: "同步接口未配置鉴权令牌" },
      { status: 503 }
    )
  }
  const authHeader = request.headers.get("x-obsidian-token")

  // 常量时间比对，防时序侧信道（与 cron secret / work-item 鉴权同惯例）。
  if (!authHeader || !safeSecretEqual(authHeader, syncToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { entries, projectId } = await parseJsonBody(
      request,
      obsidianSyncBodySchema,
      { maxBytes: 5 * 1024 * 1024 },
    )

    const userExists = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    })
    if (!userExists) {
      return NextResponse.json({ error: "同步接口绑定用户不存在" }, { status: 503 })
    }

    let boundProject: Awaited<ReturnType<typeof resolveBoundProject>>
    try {
      boundProject = await resolveBoundProject({
        userId: targetUserId,
        requestedProjectId: projectId || undefined,
      })
    } catch (error) {
      if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
        const contextError = error as { message: string; code: string; status: number }
        return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
      }
      throw error
    }
    const targetProjectId = boundProject.id

    const results = []

    for (const entry of entries) {
      if (!entry.id || !entry.title || !entry.content) {
        continue
      }

      const existingOwner = await prisma.knowledgeEntry.findUnique({
        where: { id: entry.id },
        select: { userId: true },
      })
      if (existingOwner && existingOwner.userId !== targetUserId) {
        return NextResponse.json({ error: "知识条目标识冲突" }, { status: 409 })
      }

      // 保证分类合法，不合法时默认归入 boss_experience
      const finalCategory = isKnowledgeCategory(entry.category)
        ? entry.category
        : "boss_experience"

      const upserted = await prisma.knowledgeEntry.upsert({
        where: { id: entry.id, userId: targetUserId },
        update: {
          title: entry.title,
          content: entry.content,
          category: finalCategory,
          tags: entry.tags,
          sourceType: "obsidian",
          status: "active",
          projectId: targetProjectId,
          updatedAt: new Date(),
        },
        create: {
          id: entry.id,
          userId: targetUserId,
          projectId: targetProjectId,
          title: entry.title,
          content: entry.content,
          category: finalCategory,
          tags: entry.tags,
          sourceType: "obsidian",
          status: "active",
        },
      })
      results.push({ id: upserted.id, title: upserted.title })
    }

    // Fire-and-forget: generate embeddings for synced entries
    for (const result of results) {
      ensureKnowledgeEmbedding(result.id).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      syncedCount: results.length,
      syncedEntries: results,
    })
  } catch (error) {
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse
    console.error("Obsidian sync error:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
