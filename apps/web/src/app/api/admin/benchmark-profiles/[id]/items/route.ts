import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { buildDefaultKnowledgeTags, mergeKnowledgeTags } from "@/lib/knowledge-tags"

const ALLOWED_KINDS = new Set([
  "note",
  "report",
  "copy_extraction",
  "video",
  "account_pool",
  "structure_asset",
  "topic_candidates",
])

// GET — 档案的素材列表
export const GET = withAdminAuth(async (_request, { params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  }

  const items = await prisma.benchmarkProfileItem.findMany({
    where: { profileId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  })

  return NextResponse.json({ data: items })
})

// POST — 新增一条素材（事务内同步落 KnowledgeEntry 进 RAG）
export const POST = withAdminAuth(async (request, { params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  }

  const body = await parseJsonRecord(request)
  const { title, content, kind, sortOrder } = body

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "素材标题必填" }, { status: 400 })
  }
  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "素材内容必填" }, { status: 400 })
  }
  if (kind && !ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "无效的素材类型" }, { status: 400 })
  }

  const profile = await prisma.benchmarkProfile.findUnique({
    where: { id },
    select: { id: true, userId: true, projectId: true, name: true },
  })

  if (!profile) {
    return NextResponse.json({ error: "真实档案不存在" }, { status: 404 })
  }

  // 事务：创建 item + KnowledgeEntry 原子操作
  const item = await prisma.$transaction(async (tx) => {
    const newItem = await tx.benchmarkProfileItem.create({
      data: {
        profileId: id,
        kind: kind || "note",
        title: title.trim(),
        content,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      },
    })

    await tx.knowledgeEntry.create({
      data: {
        userId: profile.userId,
        projectId: profile.projectId,
        category: "benchmark_reference",
        title: `[${profile.name}] ${newItem.title}`,
        content: newItem.content,
        tags: mergeKnowledgeTags(
          [`benchmark_profile:${profile.id}`, `benchmark_item:${newItem.id}`, `kind:${newItem.kind}`],
          buildDefaultKnowledgeTags("benchmark_reference")
        ),
        sourceType: "manual",
        status: "active",
      },
    })

    return newItem
  })

  // 向量化（事务外 fire-and-forget，失败时记录日志）
  const linkedEntry = await prisma.knowledgeEntry.findFirst({
    where: {
      category: "benchmark_reference",
      tags: { string_contains: `benchmark_item:${item.id}` },
    },
    select: { id: true },
  })

  if (linkedEntry) {
    ensureKnowledgeEmbedding(linkedEntry.id).catch((err) => {
      console.error(`[benchmark-profile] embedding failed for item ${item.id}:`, err)
    })
  }

  return NextResponse.json({ data: item }, { status: 201 })
})
