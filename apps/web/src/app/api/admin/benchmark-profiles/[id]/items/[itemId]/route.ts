import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"

const ALLOWED_KINDS = new Set([
  "note",
  "report",
  "copy_extraction",
  "video",
  "account_pool",
  "structure_asset",
  "topic_candidates",
])

// 通过 benchmark_item:<itemId> 标签定位该素材同步落库的 KnowledgeEntry
async function findLinkedKnowledgeEntry(itemId: string) {
  return prisma.knowledgeEntry.findFirst({
    where: {
      category: "benchmark_reference",
      tags: { string_contains: `benchmark_item:${itemId}` },
    },
    select: { id: true },
  })
}

// PATCH — 编辑单条素材（事务内联动更新 KnowledgeEntry + 重新向量化）
export const PATCH = withAdminAuth(async (request, { params }) => {
  const itemId = params?.itemId
  if (!itemId) {
    return NextResponse.json({ error: "缺少 itemId" }, { status: 400 })
  }

  const body = await request.json()
  const data: Record<string, unknown> = {}

  if (typeof body.title === "string") {
    if (!body.title.trim()) {
      return NextResponse.json({ error: "素材标题不能为空" }, { status: 400 })
    }
    data.title = body.title.trim()
  }
  if (typeof body.content === "string") {
    if (!body.content.trim()) {
      return NextResponse.json({ error: "素材内容不能为空" }, { status: 400 })
    }
    data.content = body.content
  }
  if (typeof body.kind === "string") {
    if (body.kind && !ALLOWED_KINDS.has(body.kind)) {
      return NextResponse.json({ error: "无效的素材类型" }, { status: 400 })
    }
    data.kind = body.kind || "note"
  }
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
    data.sortOrder = Number(body.sortOrder)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 })
  }

  // 需要联动 KnowledgeEntry 时用事务
  const shouldSyncKe = typeof body.title === "string" || typeof body.content === "string"

  const item = shouldSyncKe
    ? await prisma.$transaction(async (tx) => {
        const updatedItem = await tx.benchmarkProfileItem.update({
          where: { id: itemId },
          data,
        })

        if (shouldSyncKe) {
          const linked = await tx.knowledgeEntry.findFirst({
            where: {
              category: "benchmark_reference",
              tags: { string_contains: `benchmark_item:${itemId}` },
            },
            select: { id: true },
          })
          if (linked) {
            const profile = await tx.benchmarkProfile.findUnique({
              where: { id: updatedItem.profileId },
              select: { name: true },
            })
            await tx.knowledgeEntry.update({
              where: { id: linked.id },
              data: {
                title: `[${profile?.name ?? ""}] ${updatedItem.title}`,
                content: updatedItem.content,
              },
            })
          }
        }

        return updatedItem
      })
    : await prisma.benchmarkProfileItem.update({
        where: { id: itemId },
        data,
      })

  // 重新向量化（事务外 fire-and-forget）
  if (shouldSyncKe) {
    const linked = await findLinkedKnowledgeEntry(itemId)
    if (linked) {
      ensureKnowledgeEmbedding(linked.id).catch((err) => {
        console.error(`[benchmark-profile] re-embedding failed for item ${itemId}:`, err)
      })
    }
  }

  return NextResponse.json({ data: item })
})

// DELETE — 删除单条素材（事务内联动归档对应 KnowledgeEntry）
export const DELETE = withAdminAuth(async (_request, { params }) => {
  const itemId = params?.itemId
  if (!itemId) {
    return NextResponse.json({ error: "缺少 itemId" }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.benchmarkProfileItem.delete({ where: { id: itemId } })

    // 联动归档对应的 KnowledgeEntry
    const linked = await tx.knowledgeEntry.findFirst({
      where: {
        category: "benchmark_reference",
        tags: { string_contains: `benchmark_item:${itemId}` },
      },
      select: { id: true },
    })
    if (linked) {
      await tx.knowledgeEntry.update({
        where: { id: linked.id },
        data: { status: "archived" },
      })
    }
  })

  return NextResponse.json({ success: true })
})
