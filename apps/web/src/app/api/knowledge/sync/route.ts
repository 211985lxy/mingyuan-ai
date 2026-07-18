import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"

interface ObsidianSyncEntry {
  id: string // 由 CLI 根据文件相对路径或者内容哈希生成的唯一 ID，如 obsidian_xxxx
  title: string
  content: string
  category: "boss_experience" | "product_usp" | "customer_pain" | "project_case" | "customer_qa"
  tags: string[]
}

const VALID_CATEGORIES = [
  "boss_experience", "product_usp", "customer_pain", "project_case", "customer_qa",
] as const

function authorizeSync(request: NextRequest): NextResponse | null {
  const syncToken = process.env.OBSIDIAN_SYNC_TOKEN
  if (!syncToken) {
    console.error("[knowledge/sync] OBSIDIAN_SYNC_TOKEN 未配置,拒绝请求")
    return NextResponse.json({ error: "同步接口未配置鉴权令牌" }, { status: 503 })
  }
  if (request.headers.get("x-obsidian-token") !== syncToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

async function resolveSyncTarget(userId?: string, projectId?: string): Promise<
  | { targetUserId: string; targetProjectId: string | null }
  | { error: NextResponse }
> {
  let targetUserId = userId
  if (!targetUserId) {
    const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
    if (!firstUser) {
      return { error: NextResponse.json({ error: "No user found in the system to bind knowledge" }, { status: 404 }) }
    }
    targetUserId = firstUser.id
  } else if (!await prisma.user.findUnique({ where: { id: targetUserId } })) {
    return { error: NextResponse.json({ error: `User with ID ${targetUserId} does not exist` }, { status: 404 }) }
  }

  if (!projectId) return { targetUserId, targetProjectId: null }
  const project = await prisma.clientProject.findFirst({
    where: { id: projectId, userId: targetUserId },
    select: { id: true },
  })
  if (!project) {
    return { error: NextResponse.json({ error: "Project does not exist for target user" }, { status: 404 }) }
  }
  return { targetUserId, targetProjectId: project.id }
}

async function syncKnowledgeEntries(
  entries: ObsidianSyncEntry[],
  targetUserId: string,
  targetProjectId: string | null,
) {
  const results: Array<{ id: string; title: string }> = []
  for (const entry of entries) {
    if (!entry.id || !entry.title || !entry.content) continue
    const category = VALID_CATEGORIES.includes(entry.category) ? entry.category : "boss_experience"
    const upserted = await prisma.knowledgeEntry.upsert({
      where: { id: entry.id },
      update: {
        title: entry.title, content: entry.content, category, tags: entry.tags,
        sourceType: "obsidian", status: "active",
        ...(targetProjectId ? { projectId: targetProjectId } : {}),
        updatedAt: new Date(),
      },
      create: {
        id: entry.id, userId: targetUserId, projectId: targetProjectId,
        title: entry.title, content: entry.content, category, tags: entry.tags,
        sourceType: "obsidian", status: "active",
      },
    })
    results.push({ id: upserted.id, title: upserted.title })
  }
  results.forEach((result) => ensureKnowledgeEmbedding(result.id).catch(() => {}))
  return results
}

export async function POST(request: NextRequest) {
  const authError = authorizeSync(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { entries, userId, projectId } = body as {
      entries: ObsidianSyncEntry[]
      userId?: string
      projectId?: string
    }

    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: "Invalid payload: entries must be an array" }, { status: 400 })
    }

    const target = await resolveSyncTarget(userId, projectId)
    if ("error" in target) return target.error
    const results = await syncKnowledgeEntries(entries, target.targetUserId, target.targetProjectId)

    return NextResponse.json({
      success: true,
      syncedCount: results.length,
      syncedEntries: results,
    })
  } catch (error) {
    console.error("Obsidian sync error:", error)
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    )
  }
}
