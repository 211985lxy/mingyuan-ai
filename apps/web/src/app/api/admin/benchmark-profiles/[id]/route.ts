import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

const ALLOWED_PLATFORMS = new Set(["douyin", "xiaohongshu", "bilibili", "kuaishou"])

// 通过 benchmark_profile:<profileId> 标签批量定位关联 KnowledgeEntry
async function findLinkedKnowledgeEntries(profileId: string) {
  return prisma.knowledgeEntry.findMany({
    where: {
      category: "benchmark_reference",
      tags: { string_contains: `benchmark_profile:${profileId}` },
    },
    select: { id: true },
  })
}

// 批量更新关联 KnowledgeEntry 状态
async function syncKnowledgeEntryStatus(profileId: string, status: "active" | "archived") {
  const entries = await findLinkedKnowledgeEntries(profileId)
  if (entries.length > 0) {
    await prisma.knowledgeEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { status },
    }).catch((err) => {
      console.error(`[benchmark-profile] syncKnowledgeEntryStatus(${profileId}, ${status}) failed:`, err)
    })
  }
}

// GET — 档案详情（含所有素材条目）
export const GET = withAdminAuth(async (_request, { params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  }

  const profile = await prisma.benchmarkProfile.findUnique({
    where: { id },
    include: {
      project: {
        select: { id: true, name: true, companyName: true, industry: true, status: true },
      },
      user: { select: { id: true, name: true, email: true } },
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
    },
  })

  if (!profile) {
    return NextResponse.json({ error: "真实档案不存在" }, { status: 404 })
  }

  return NextResponse.json({ data: profile })
})

// PATCH — 更新档案头部字段（含状态恢复）
export const PATCH = withAdminAuth(async (request, { params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  }

  const body = await request.json()
  const data: Record<string, unknown> = {}

  if (typeof body.name === "string") {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "账号名称不能为空" }, { status: 400 })
    }
    data.name = body.name.trim()
  }
  if (typeof body.platform === "string") {
    if (body.platform && !ALLOWED_PLATFORMS.has(body.platform)) {
      return NextResponse.json({ error: "不支持的平台" }, { status: 400 })
    }
    data.platform = body.platform || "douyin"
  }
  if (typeof body.accountUrl === "string") data.accountUrl = body.accountUrl.trim() || null
  if (typeof body.platformUserId === "string") data.platformUserId = body.platformUserId.trim() || null
  if (body.followerCount !== undefined) {
    data.followerCount = Number.isFinite(Number(body.followerCount)) ? Number(body.followerCount) : null
  }
  if (Array.isArray(body.personaTags)) data.personaTags = body.personaTags
  if (typeof body.positioning === "string") data.positioning = body.positioning || null
  if (typeof body.differentiator === "string") data.differentiator = body.differentiator || null
  if (typeof body.takeaways === "string") data.takeaways = body.takeaways || null
  if (typeof body.notes === "string") data.notes = body.notes || null
  if (typeof body.status === "string" && ["active", "archived"].includes(body.status)) {
    data.status = body.status
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 })
  }

  const profile = await prisma.benchmarkProfile.update({
    where: { id },
    data,
    include: {
      project: { select: { id: true, name: true } },
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
    },
  })

  // 状态变更时同步关联 KnowledgeEntry
  if (typeof data.status === "string" && (data.status === "active" || data.status === "archived")) {
    await syncKnowledgeEntryStatus(id, data.status)
  }

  return NextResponse.json({ data: profile })
})

// DELETE — 软删除（归档），同步归档关联 KnowledgeEntry
export const DELETE = withAdminAuth(async (_request, { params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  }

  await prisma.benchmarkProfile.update({
    where: { id },
    data: { status: "archived" },
  })

  // 同步归档所有关联 KnowledgeEntry，使其不再被 RAG 检索
  await syncKnowledgeEntryStatus(id, "archived")

  return NextResponse.json({ success: true })
})
