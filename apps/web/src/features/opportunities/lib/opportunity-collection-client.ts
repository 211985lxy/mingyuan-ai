import type { OpportunityItem } from "@/features/opportunities/contracts/types"

export function toCollectionItemPayload(item: OpportunityItem) {
  return {
    platform: item.platform,
    sourceId: item.sourceId,
    sourceUrl: item.sourceUrl,
    title: item.title,
    authorName: item.author.name,
    authorId: item.author.id,
    followerCount: item.author.followerCount,
    publishedAt: item.publishedAt,
    durationSeconds: item.durationSeconds,
    views: item.metrics.views,
    likes: item.metrics.likes,
    comments: item.metrics.comments,
    shares: item.metrics.shares,
    collects: item.metrics.collects,
    opportunityScore: item.opportunityScore,
    scoreConfidence: item.scoreConfidence,
  }
}

export async function saveOpportunityCollection(input: {
  name: string
  items: OpportunityItem[]
  projectId?: string | null
}): Promise<{ id: string }> {
  const res = await fetch("/api/content-opportunities/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      items: input.items.map(toCollectionItemPayload),
    }),
  })
  const data = await res.json().catch(() => ({})) as { id?: string; error?: string }
  if (!res.ok || !data.id) {
    throw new Error(data.error || "保存研究篮失败")
  }
  return { id: data.id }
}

/** 单条对标：建研究篮 → 创建经营事项，返回 AIM generationId */
export async function adoptOpportunityForWriting(input: {
  item: OpportunityItem
  projectId?: string | null
  keyword?: string
}): Promise<{ generationId: string; collectionId: string }> {
  const title = input.item.title?.trim() || "对标选题"
  const { id: collectionId } = await saveOpportunityCollection({
    name: `${input.keyword?.trim() || "对标"} · ${title.slice(0, 40)}`,
    items: [input.item],
    projectId: input.projectId,
  })

  const res = await fetch(`/api/content-opportunities/collections/${collectionId}/create-work-item`, {
    method: "POST",
  })
  const data = await res.json().catch(() => ({})) as {
    generationId?: string
    error?: string
  }
  if (!res.ok || !data.generationId) {
    throw new Error(data.error || "创建写稿事项失败")
  }
  return { generationId: data.generationId, collectionId }
}

export async function searchContentOpportunities(input: {
  keyword: string
  platforms: Array<"douyin" | "wechat_channels">
  count?: number
  sortOrder?: string
  timeRange?: string
}): Promise<{ items: OpportunityItem[]; warnings: string[] }> {
  const res = await fetch("/api/content-opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword: input.keyword.trim(),
      platforms: input.platforms,
      count: input.count ?? 12,
      filters: {
        sortOrder: input.sortOrder,
        timeRange: input.timeRange === "all" ? undefined : input.timeRange,
      },
    }),
  })
  const data = await res.json().catch(() => ({})) as {
    items?: OpportunityItem[]
    warnings?: string[]
    error?: string
  }
  if (!res.ok) throw new Error(data.error || `搜索失败 (${res.status})`)
  return {
    items: data.items ?? [],
    warnings: data.warnings ?? [],
  }
}

export function formatOpportunityMetric(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
