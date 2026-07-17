import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"

interface ObsidianSyncEntry {
  id: string // 由 CLI 根据文件相对路径或者内容哈希生成的唯一 ID，如 obsidian_xxxx
  title: string
  content: string
  category: "boss_experience" | "product_usp" | "customer_pain" | "project_case" | "customer_qa" | "daily_inspiration" | "benchmark_reference" | "user_insight" | "hot_topic" | "positioning_material" | "private_domain_material" | "writing_style_profile"
  tags: string[]
}

export async function POST(request: NextRequest) {
  const syncToken = process.env.OBSIDIAN_SYNC_TOKEN
  if (!syncToken) {
    console.error("[knowledge/sync] OBSIDIAN_SYNC_TOKEN 未配置,拒绝请求")
    return NextResponse.json(
      { error: "同步接口未配置鉴权令牌" },
      { status: 503 }
    )
  }
  const authHeader = request.headers.get("x-obsidian-token")

  if (!authHeader || authHeader !== syncToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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

    let targetUserId = userId

    // 如果未显式提供 userId，则兜底关联系统中的第一个 User
    if (!targetUserId) {
      const firstUser = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
      })
      if (!firstUser) {
        return NextResponse.json({ error: "No user found in the system to bind knowledge" }, { status: 404 })
      }
      targetUserId = firstUser.id
    } else {
      // 校验该 userId 是否真实存在
      const userExists = await prisma.user.findUnique({
        where: { id: targetUserId },
      })
      if (!userExists) {
        return NextResponse.json({ error: `User with ID ${targetUserId} does not exist` }, { status: 404 })
      }
    }

    let targetProjectId: string | null = null
    if (projectId) {
      const project = await prisma.clientProject.findFirst({
        where: { id: projectId, userId: targetUserId },
        select: { id: true },
      })
      if (!project) {
        return NextResponse.json({ error: "Project does not exist for target user" }, { status: 404 })
      }
      targetProjectId = project.id
    }

    const results = []

    for (const entry of entries) {
      if (!entry.id || !entry.title || !entry.content) {
        continue
      }

      // 保证分类合法，不合法时默认归入 boss_experience
      const validCategories = [
        "boss_experience",
        "product_usp",
        "customer_pain",
        "project_case",
        "customer_qa",
        "daily_inspiration",
        "benchmark_reference",
        "user_insight",
        "hot_topic",
        "positioning_material",
        "private_domain_material",
        "writing_style_profile",
      ]
      const finalCategory = validCategories.includes(entry.category)
        ? entry.category
        : "boss_experience"

      const upserted = await prisma.knowledgeEntry.upsert({
        where: { id: entry.id },
        update: {
          title: entry.title,
          content: entry.content,
          category: finalCategory,
          tags: entry.tags,
          sourceType: "obsidian",
          status: "active",
          ...(targetProjectId ? { projectId: targetProjectId } : {}),
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
    console.error("Obsidian sync error:", error)
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    )
  }
}
