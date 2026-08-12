import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { extractAndPersistForEntry } from "@/lib/knowledge-entity-extractor"
import { enforceKnowledgeBetaLimit } from "@/lib/internal-beta-limits"

interface ConfirmedEntry {
  title: string
  content: string
  category: string
  tags: string[]
  valueGrade?: string
  skip?: boolean
}

/**
 * POST /api/admin/knowledge/smart-import/confirm
 * 接收管理员确认的条目 → 批量写入 + 触发向量化
 */
export const POST = withAdminOrEditor(async (request) => {
  const body = await parseJsonRecord(request)
  const { userId, projectId, entries } = body as {
    userId: string
    projectId: string | null
    entries: ConfirmedEntry[]
  }

  if (!userId || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 })
  }

  const toCreate = entries.filter((e) => !e.skip)
  if (toCreate.length === 0) {
    return NextResponse.json({ data: { created: 0 } })
  }

  const limitResponse = await enforceKnowledgeBetaLimit({
    userId,
    projectId,
    incoming: toCreate.length,
  })
  if (limitResponse) return limitResponse

  const created = await prisma.$transaction(
    toCreate.map((entry) =>
      prisma.knowledgeEntry.create({
        data: {
          userId,
          projectId: projectId || null,
          category: entry.category,
          title: entry.title.slice(0, 200),
          content: entry.content.slice(0, 50000),
          tags: entry.tags || [],
          sourceType: "smart_import",
          valueGrade: entry.valueGrade || null,
          status: "active",
        },
      }),
    ),
  )

  // Fire-and-forget 向量化 + 实体抽取
  for (const entry of created) {
    ensureKnowledgeEmbedding(entry.id).catch(() => {})
    extractAndPersistForEntry(entry.id, entry.content, {
      userId: entry.userId,
      projectId: entry.projectId || null,
    }).catch(() => {})
  }

  return NextResponse.json({
    data: { created: created.length },
  })
})
