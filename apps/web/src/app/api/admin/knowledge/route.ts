import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { buildDefaultKnowledgeTags, mergeKnowledgeTags, normalizeValueGrade } from "@/lib/knowledge-tags"

// GET — 查看所有用户的知识库条目（分页+搜索+过滤）
export const GET = withAdminOrEditor(async (request) => {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20))
  const search = searchParams.get("search") ?? ""
  const category = searchParams.get("category") ?? ""
  const userId = searchParams.get("userId") ?? ""
  const sourceType = searchParams.get("sourceType") ?? ""
  const projectId = searchParams.get("projectId") ?? ""
  const valueGrade = normalizeValueGrade(searchParams.get("valueGrade"))
  const status = searchParams.get("status") ?? ""

  const where: Record<string, unknown> = {}
  if (status === "active" || status === "archived") where.status = status
  if (category) where.category = category
  if (userId) where.userId = userId
  if (sourceType) where.sourceType = sourceType
  if (projectId === "unbound") where.projectId = null
  else if (projectId) where.projectId = projectId
  if (valueGrade) where.valueGrade = valueGrade
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { content: { contains: search } },
    ]
  }

  const [entries, total] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, companyName: true, industry: true, status: true } },
        embedding: { select: { status: true, updatedAt: true, errorMessage: true } },
      },
    }),
    prisma.knowledgeEntry.count({ where }),
  ])

  return NextResponse.json({
    data: { results: entries, total, page, pageSize },
  })
})

// POST — 管理员手动录入知识条目
export const POST = withAdminOrEditor(async (request, { admin }) => {
  const body = await parseJsonRecord(request)
  const { category, title, content, tags, sourceType, valueGrade } = body
  const projectId = typeof body.projectId === "string" && body.projectId.trim()
    ? body.projectId.trim()
    : null

  if (!category || !title || !content) {
    return NextResponse.json({ error: "category, title, content 必填" }, { status: 400 })
  }

  const project = projectId
    ? await prisma.clientProject.findUnique({
        where: { id: projectId },
        select: { id: true, userId: true },
      })
    : null

  if (projectId && !project) {
    return NextResponse.json({ error: "归属项目不存在" }, { status: 404 })
  }

  const user = project
    ? { id: project.userId }
    : await prisma.user.findUnique({
        where: { email: admin.email },
        select: { id: true },
      })

  if (!user) {
    return NextResponse.json({ error: "未找到同邮箱前台用户，无法绑定知识条目" }, { status: 400 })
  }

  const entry = await prisma.knowledgeEntry.create({
    data: {
      userId: user.id,
      projectId: project?.id ?? null,
      category,
      title,
      content,
      tags: mergeKnowledgeTags(tags, buildDefaultKnowledgeTags(category)),
      sourceType: sourceType || "manual",
      valueGrade: normalizeValueGrade(valueGrade),
      status: "active",
    },
  })

  ensureKnowledgeEmbedding(entry.id).catch(() => {})

  return NextResponse.json({ data: entry }, { status: 201 })
})

// PUT — 管理员强制批量更新（批量变更状态或分类）
export const PUT = withAdminOrEditor(async (request) => {
  const body = await parseJsonRecord(request)
  const { ids, action, value } = body

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
    return NextResponse.json({ error: "ids 必填且最多 500 条" }, { status: 400 })
  }

  if (action === "archive") {
    await prisma.knowledgeEntry.updateMany({
      where: { id: { in: ids } },
      data: { status: "archived" },
    })
  } else if (action === "activate") {
    await prisma.knowledgeEntry.updateMany({
      where: { id: { in: ids } },
      data: { status: "active" },
    })
  } else if (action === "delete") {
    await prisma.knowledgeEntry.deleteMany({
      where: { id: { in: ids } },
    })
  } else if (action === "changeCategory" && value) {
    await prisma.knowledgeEntry.updateMany({
      where: { id: { in: ids } },
      data: { category: value },
    })
  } else if (action === "changeValueGrade") {
    // value 为空字符串 → 清除分级(设为 null)；否则校验 S/A/B/C
    const grade = value === "" ? null : normalizeValueGrade(value)
    if (value !== "" && !grade) {
      return NextResponse.json({ error: "无效的价值分级（应为 S/A/B/C）" }, { status: 400 })
    }
    await prisma.knowledgeEntry.updateMany({
      where: { id: { in: ids } },
      data: { valueGrade: grade },
    })
  } else if (action === "mergeTags" && Array.isArray(value)) {
    const entries = await prisma.knowledgeEntry.findMany({
      where: { id: { in: ids } },
      select: { id: true, tags: true },
      take: 500,
    })
    await Promise.all(entries.map((entry) =>
      prisma.knowledgeEntry.update({
        where: { id: entry.id },
        data: { tags: mergeKnowledgeTags(entry.tags, value) },
      }),
    ))
  } else {
    return NextResponse.json({ error: "无效操作" }, { status: 400 })
  }

  return NextResponse.json({ success: true })
})

// DELETE — 批量删除
export const DELETE = withAdminOrEditor(async (request) => {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const ids = searchParams.get("ids")

  if (id) {
    await prisma.knowledgeEntry.delete({ where: { id } })
  } else if (ids) {
    const idList = ids.split(",")
    await prisma.knowledgeEntry.deleteMany({ where: { id: { in: idList } } })
  } else {
    return NextResponse.json({ error: "需要 id 或 ids 参数" }, { status: 400 })
  }

  return NextResponse.json({ success: true })
})
