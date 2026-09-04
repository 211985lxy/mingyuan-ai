/**
 * 选题归因聚合（WP-D 第 5 环）。
 *
 * 按内容任务聚合周期内已发布内容，回答「哪类选题带来播放、哪类带来可追溯线索」。
 * 纪律：
 * - 空值≠0：播放全未回填时输出 null，不是 0。
 * - 7/14/30 是累计快照：只取周期末最成熟窗口，不相加。
 * - 线索按「挂到哪条内容」计，不看登记时间（线索常在周期后登记，仍属该内容）。
 * - publishedCount < 3 只列事实，不下结论。
 * - 内容任务未标注归入「未标注」，不猜测补齐。
 */

import { normalizeAttributionMethod } from "@/lib/aim/outcome-attribution"
import { pickPeriodEndSnapshots } from "@/lib/aim/weekly-review"

export interface TaskAttributionInsight {
  contentTask: string
  publishedCount: number
  /** 周期末最成熟快照的播放合计；全部未回填为 null（空值≠0） */
  viewsTotal: number | null
  /** 明确归因 + 首触归因的线索数 */
  traceableLeadCount: number
  /** 来源不明的线索数（如实单列，禁止混入可追溯） */
  unknownLeadCount: number
  /** 小样本提示；样本足够时为 null */
  sampleNote: string | null
}

export interface InsightGenerationRow {
  id: string
  workflowStatus: string
  publishedAt: Date | null
  taskSpec: unknown
}

export interface InsightOutcomeRow {
  generationId: string
  collectWindowDay: number
  collectedAt: Date
  views: number | null
}

export interface InsightAttributionRow {
  generationId: string
  attributionMethod: string
}

/** prisma 的最小投影（便于注入测试替身）。 */
export interface AttributionInsightsStorePort {
  aimGeneration: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<InsightGenerationRow[]>
  }
  contentOutcome: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<InsightOutcomeRow[]>
  }
  outcomeAttribution: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<InsightAttributionRow[]>
  }
}

const UNSPECIFIED_TASK = "未标注"
const MIN_SAMPLE = 3

function resolveContentTask(taskSpec: unknown): string {
  if (typeof taskSpec !== "object" || taskSpec === null) return UNSPECIFIED_TASK
  const value = (taskSpec as { contentTask?: unknown }).contentTask
  return typeof value === "string" && value.trim() ? value.trim() : UNSPECIFIED_TASK
}

function inPeriod(value: Date | null, start: Date, end: Date): value is Date {
  return value != null && value.getTime() >= start.getTime() && value.getTime() < end.getTime()
}

/**
 * 计算 [start, end) 周期内按内容任务聚合的选题归因。
 * 返回顺序：可追溯线索多在前；「未标注」固定最后。
 */
export async function computeTaskAttributionInsights(input: {
  userId?: string
  projectId?: string
  start: Date
  end: Date
  store: AttributionInsightsStorePort
}): Promise<TaskAttributionInsight[]> {
  const scope = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  }
  const generations = (await input.store.aimGeneration.findMany({ where: scope, take: 1000 }))
    .filter((g) => g.workflowStatus === "published" && inPeriod(g.publishedAt, input.start, input.end))
  if (generations.length === 0) return []
  const generationIds = generations.map((g) => g.id)

  const [outcomes, attributions] = await Promise.all([
    input.store.contentOutcome.findMany({
      where: { ...scope, generationId: { in: generationIds } },
      take: 5000,
    }),
    input.store.outcomeAttribution.findMany({
      where: { ...scope, generationId: { in: generationIds } },
      take: 5000,
    }),
  ])

  // 播放：每条内容取周期末最成熟快照（collectedAt < end），全未回填 → null
  const viewsByGeneration = new Map<string, number | null>(
    pickPeriodEndSnapshots(
      outcomes.filter((row) => row.collectedAt.getTime() < input.end.getTime()),
    ).map((row) => [row.generationId, row.views]),
  )

  const leadsByGeneration = new Map<string, { traceable: number; unknown: number }>()
  for (const row of attributions) {
    const method = normalizeAttributionMethod(row.attributionMethod)
    const bucket = leadsByGeneration.get(row.generationId) ?? { traceable: 0, unknown: 0 }
    if (method === "explicit" || method === "first_touch") bucket.traceable += 1
    else bucket.unknown += 1
    leadsByGeneration.set(row.generationId, bucket)
  }

  const grouped = new Map<string, {
    publishedCount: number
    viewsKnown: number
    viewsSum: number
    traceable: number
    unknown: number
  }>()
  for (const generation of generations) {
    const task = resolveContentTask(generation.taskSpec)
    const bucket = grouped.get(task) ?? { publishedCount: 0, viewsKnown: 0, viewsSum: 0, traceable: 0, unknown: 0 }
    bucket.publishedCount += 1
    const views = viewsByGeneration.get(generation.id)
    if (views != null && Number.isFinite(views)) {
      bucket.viewsKnown += 1
      bucket.viewsSum += views
    }
    const leads = leadsByGeneration.get(generation.id)
    bucket.traceable += leads?.traceable ?? 0
    bucket.unknown += leads?.unknown ?? 0
    grouped.set(task, bucket)
  }

  return [...grouped.entries()]
    .map(([contentTask, bucket]) => ({
      contentTask,
      publishedCount: bucket.publishedCount,
      viewsTotal: bucket.viewsKnown > 0 ? bucket.viewsSum : null,
      traceableLeadCount: bucket.traceable,
      unknownLeadCount: bucket.unknown,
      sampleNote: bucket.publishedCount < MIN_SAMPLE
        ? `样本不足（${bucket.publishedCount} 条），仅列事实，不下结论`
        : null,
    }))
    .sort((a, b) => {
      if (a.contentTask === UNSPECIFIED_TASK) return 1
      if (b.contentTask === UNSPECIFIED_TASK) return -1
      if (b.traceableLeadCount !== a.traceableLeadCount) return b.traceableLeadCount - a.traceableLeadCount
      return b.publishedCount - a.publishedCount
    })
}
