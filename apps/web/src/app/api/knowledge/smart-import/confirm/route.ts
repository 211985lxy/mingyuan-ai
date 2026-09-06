import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { extractAndPersistForEntry } from "@/lib/knowledge-entity-extractor"
import { enforceKnowledgeBetaLimit } from "@/lib/internal-beta-limits"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

interface ConfirmedEntry {
  title: string
  content: string
  category: string
  tags: string[]
  valueGrade?: string
  skip?: boolean
}

/**
 * POST /api/knowledge/smart-import/confirm
 * 客户侧：确认预览条目 → 批量写入 + 触发向量化（userId 以登录用户为准）
 */
export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonRecord(request)
  const projectIdRaw = body.projectId
  const requestedProjectId =
    typeof projectIdRaw === "string" && projectIdRaw.trim()
      ? projectIdRaw.trim()
      : undefined
  const entries = Array.isArray(body.entries) ? (body.entries as ConfirmedEntry[]) : null

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 })
  }

  let project: Awaited<ReturnType<typeof resolveBoundProject>>
  try {
    project = await resolveBoundProject({ userId: user.id, requestedProjectId })
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    throw error
  }

  const toCreate = entries.filter((entry) => !entry.skip)
  if (toCreate.length === 0) {
    return NextResponse.json({ data: { created: 0 } })
  }

  const limitResponse = await enforceKnowledgeBetaLimit({
    userId: user.id,
    projectId: project.id,
    incoming: toCreate.length,
  })
  if (limitResponse) return limitResponse

  const created = await prisma.$transaction(
    toCreate.map((entry) =>
      prisma.knowledgeEntry.create({
        data: {
          userId: user.id,
          projectId: project.id,
          category: entry.category,
          title: String(entry.title ?? "").slice(0, 200),
          content: String(entry.content ?? "").slice(0, 50000),
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          sourceType: "smart_import",
          valueGrade: entry.valueGrade || null,
          status: "active",
        },
      }),
    ),
  )

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

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
