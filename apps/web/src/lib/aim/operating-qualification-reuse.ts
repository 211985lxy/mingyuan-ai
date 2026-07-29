/**
 * 经营资格：真实案例复用 + 人工标注样本证据加载。
 * 查询有边界；溢出 fail closed，不给出不完整结论。
 */

import { prisma } from "@/lib/prisma"

const CASE_LIMIT = 500
const GENERATION_LIMIT = 2_000
const SAMPLE_LIMIT = 2_000

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function knowledgeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = object(item)
    return typeof row?.id === "string" && row.id.trim() ? [row.id] : []
  })
}

/**
 * 客户结果支持的已批准候选，已晋升为 KnowledgeEntry.project_case，
 * 且 promotedAt 之后有 AimGeneration.knowledgeUsed 实际引用该 entry。
 */
export async function loadReusedCustomerOutcomeCases(): Promise<{
  count: number
  refs: string[]
}> {
  const candidates = await prisma.assetCandidate.findMany({
    where: {
      reviewStatus: "approved",
      kind: "case_candidate",
      customerOutcomeProjectionId: { not: null },
      promotedEntryId: { not: null },
      promotedAt: { not: null },
    },
    take: CASE_LIMIT + 1,
    select: {
      id: true,
      promotedEntryId: true,
      promotedAt: true,
    },
  })
  if (candidates.length > CASE_LIMIT) {
    throw new Error("客户结果案例候选超过查询边界，拒绝给出不完整结论")
  }
  if (!candidates.length) return { count: 0, refs: [] }

  const entryIds = [...new Set(candidates.map((row) => row.promotedEntryId!))]
  const entries = await prisma.knowledgeEntry.findMany({
    where: { id: { in: entryIds }, category: "project_case" },
    take: CASE_LIMIT + 1,
    select: { id: true },
  })
  if (entries.length > CASE_LIMIT) {
    throw new Error("项目案例知识条目超过查询边界，拒绝给出不完整结论")
  }
  const projectCaseIds = new Set(entries.map((row) => row.id))
  const eligible = candidates.filter((row) =>
    row.promotedEntryId && projectCaseIds.has(row.promotedEntryId))
  if (!eligible.length) return { count: 0, refs: [] }

  const earliest = eligible.reduce(
    (min, row) => Math.min(min, row.promotedAt!.getTime()),
    Number.POSITIVE_INFINITY,
  )
  const generations = await prisma.aimGeneration.findMany({
    where: { createdAt: { gte: new Date(earliest) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: GENERATION_LIMIT + 1,
    select: { id: true, createdAt: true, knowledgeUsed: true },
  })
  if (generations.length > GENERATION_LIMIT) {
    throw new Error("生成记录超过查询边界，拒绝给出不完整结论")
  }

  const refs: string[] = []
  for (const candidate of eligible) {
    const entryId = candidate.promotedEntryId!
    const promotedAt = candidate.promotedAt!
    const hit = generations.find((generation) =>
      generation.createdAt.getTime() >= promotedAt.getTime()
      && knowledgeIds(generation.knowledgeUsed).includes(entryId))
    if (hit) refs.push(`asset_candidate:${candidate.id}`)
  }
  return { count: refs.length, refs }
}

/** 人工 reviewerId 且 payload.annotation 存在的学习样本。 */
export async function loadAnnotatedLearningSamples(): Promise<{
  count: number
  refs: string[]
}> {
  const rows = await prisma.learningCandidate.findMany({
    where: { reviewerId: { not: null } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: SAMPLE_LIMIT + 1,
    select: { id: true, reviewerId: true, payload: true },
  })
  if (rows.length > SAMPLE_LIMIT) {
    throw new Error("人工标注学习样本超过查询边界，拒绝给出不完整结论")
  }
  const refs = rows.flatMap((row) => {
    if (!row.reviewerId?.trim()) return []
    const annotation = object(row.payload)?.annotation
    return annotation && typeof annotation === "object" && !Array.isArray(annotation)
      ? [`learning_candidate:${row.id}`]
      : []
  })
  return { count: refs.length, refs }
}
