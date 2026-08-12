import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { CATEGORY_LABELS, SOURCE_TYPE_LABELS } from "@/lib/knowledge-categories"
import { parseKnowledgeTags } from "@/lib/knowledge-tags"

const TOTAL_CATEGORIES = 12

// GET — 知识库统计（分类分布、价值分级、项目维度、向量化状态、结构健康度）
export const GET = withAdminOrEditor(async (request) => {
  const { searchParams } = new URL(request.url)
  const projectIdParam = searchParams.get("projectId") ?? ""

  // 基础 where：只看 active 条目，可选按项目筛选
  const baseWhere: Record<string, unknown> = { status: "active" }
  if (projectIdParam === "unbound") baseWhere.projectId = null
  else if (projectIdParam) baseWhere.projectId = projectIdParam

  const [
    totalEntries,
    categoryGroups,
    valueGradeGroups,
    projectGroups,
    projectCategoryGroups,
    sourceTypeGroups,
    embeddingCompleted,
    embeddingFailed,
    embeddingPending,
    attentionEntries,
  ] = await Promise.all([
    prisma.knowledgeEntry.count({ where: baseWhere }),

    prisma.knowledgeEntry.groupBy({
      by: ["category"],
      _count: { id: true },
      where: baseWhere,
      orderBy: { _count: { id: "desc" } },
    }),

    prisma.knowledgeEntry.groupBy({
      by: ["valueGrade"],
      _count: { id: true },
      where: baseWhere,
    }),

    prisma.knowledgeEntry.groupBy({
      by: ["projectId"],
      _count: { id: true },
      where: baseWhere,
      orderBy: { _count: { id: "desc" } },
    }),

    // 按 [项目, 分类] 分组，计算每个项目的分类覆盖数
    prisma.knowledgeEntry.groupBy({
      by: ["projectId", "category"],
      where: baseWhere,
    }),

    prisma.knowledgeEntry.groupBy({
      by: ["sourceType"],
      _count: { id: true },
      where: baseWhere,
    }),

    // 向量化状态：统计 embedding 行
    prisma.knowledgeEmbedding.count({
      where: { status: "completed", entry: baseWhere },
    }),
    prisma.knowledgeEmbedding.count({
      where: { status: "failed", entry: baseWhere },
    }),
    prisma.knowledgeEmbedding.count({
      where: { status: "pending", entry: baseWhere },
    }),
    prisma.knowledgeEntry.findMany({
      where: baseWhere,
      select: { projectId: true, valueGrade: true, tags: true, embedding: { select: { status: true } } },
      take: 5000,
    }),
  ])

  // --- 分类分布 ---
  const categoryMap = new Map(categoryGroups.map((g) => [g.category, g._count.id] as const))
  // 确保 12 个分类都出现在结果中（count=0 的也展示）
  const categoryDistribution = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
    category: key,
    categoryLabel: label,
    count: categoryMap.get(key) ?? 0,
  }))

  // --- 价值分级 ---
  const valueGradeDistribution = valueGradeGroups.map((g) => ({
    valueGrade: g.valueGrade ?? null,
    count: g._count.id,
  }))

  // --- 项目维度 ---
  // 获取项目名称
  const projectIds = projectGroups.map((g) => g.projectId).filter((id): id is string => Boolean(id))
  const projectMap = new Map<string, { name: string; companyName: string | null }>()
  if (projectIds.length > 0) {
    const projects = await prisma.clientProject.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true, companyName: true },
      take: 500,
    })
    for (const p of projects) projectMap.set(p.id, { name: p.name, companyName: p.companyName })
  }

  // 每个项目的分类覆盖数（从 projectCategoryGroups 计算）
  const projectCategoryCoverage = new Map<string, Set<string>>()
  for (const g of projectCategoryGroups) {
    const pid = g.projectId ?? "__unbound__"
    if (!projectCategoryCoverage.has(pid)) projectCategoryCoverage.set(pid, new Set())
    projectCategoryCoverage.get(pid)!.add(g.category)
  }

  const attentionByProject = new Map<string, number>()
  for (const entry of attentionEntries) {
    const tags = parseKnowledgeTags(entry.tags)
    const needsAttention = !entry.valueGrade || !tags.isCleaned || tags.confidence === "pending_verify" || entry.embedding?.status === "failed"
    if (needsAttention) {
      const key = entry.projectId ?? "__unbound__"
      attentionByProject.set(key, (attentionByProject.get(key) ?? 0) + 1)
    }
  }

  const projectDistribution = projectGroups
    .slice(0, 20) // 最多展示 20 个项目 + 其他
    .map((g) => ({
      projectId: g.projectId ?? null,
      projectName: projectMap.get(g.projectId ?? "")?.name ?? null,
      companyName: projectMap.get(g.projectId ?? "")?.companyName ?? null,
      entryCount: g._count.id,
      categoryCoverage: projectCategoryCoverage.get(g.projectId ?? "__unbound__")?.size ?? 0,
      attentionCount: attentionByProject.get(g.projectId ?? "__unbound__") ?? 0,
    }))

  // --- 知识来源 ---
  const sourceTypeDistribution = sourceTypeGroups.map((g) => ({
    sourceType: g.sourceType,
    sourceLabel: SOURCE_TYPE_LABELS[g.sourceType] ?? g.sourceType,
    count: g._count.id,
  }))

  // --- 向量化状态 ---
  const totalWithEmbedding = embeddingCompleted + embeddingFailed + embeddingPending
  const embeddingStatus = [
    { status: "completed", label: "已完成", count: embeddingCompleted },
    { status: "failed", label: "失败", count: embeddingFailed },
    { status: "pending", label: "生成中", count: embeddingPending },
    { status: null, label: "未生成", count: totalEntries - totalWithEmbedding },
  ].filter((s) => s.count > 0)

  // --- 结构健康度 ---
  const activeCategories = categoryDistribution.filter((c) => c.count > 0).length
  const ungradedCount = totalEntries - valueGradeGroups
    .filter((g) => g.valueGrade !== null)
    .reduce((sum, g) => sum + g._count.id, 0)
  const unboundCount = totalEntries - projectGroups
    .filter((g) => g.projectId !== null)
    .reduce((sum, g) => sum + g._count.id, 0)

  const categoryHealth = {
    totalCategories: TOTAL_CATEGORIES,
    activeCategories,
    ungradedCount,
    unboundCount,
  }

  return NextResponse.json({
    data: {
      totalEntries,
      categoryDistribution,
      valueGradeDistribution,
      projectDistribution,
      sourceTypeDistribution,
      embeddingStatus,
      categoryHealth,
    },
  })
})
