/**
 * 每周经营复盘（90 天计划 3.3）。
 *
 * 固定只看五个主指标：
 *   1. 发布内容数（publishedAt 落在周期内）
 *   2. 有效线索数（周期内 ContentOutcome 已填值求和）
 *   3. 诊断预约数（同上）
 *   4. 成交数与收入（同上）
 *   5. 被重复调用的知识/案例资产数（knowledgeUsed 中被引用 ≥2 次的条目数）
 *
 * 另附第 7 天回填率（due/filled）：衡量「发布后第 7 天经营结果回填」纪律。
 * 原则：null 不当 0；周期外数据不计入；显式填 0 是有效数据。
 * 7/14/30 是累计快照：同一 generation 多窗口禁止直接相加，取周期末最成熟窗口。
 */

export interface WeeklyReviewMetrics {
  periodStart: string
  periodEnd: string
  /** 1. 发布内容数 */
  publishedCount: number
  /** 2. 有效线索数 */
  qualifiedLeadCount: number
  /** 3. 诊断预约数 */
  appointmentCount: number
  /** 4. 成交数与收入 */
  dealCount: number
  revenue: number
  /** 5. 资产复用：被引用过的资产数 / 其中被重复调用（≥2 次）的资产数 */
  referencedAssetCount: number
  reusedAssetCount: number
  /** 第 7 天回填率：到期窗口数 / 已回填窗口数 */
  day7Backfill: { due: number; filled: number }
}

interface GenerationRow {
  id: string
  workflowStatus: string
  publishedAt: Date | null
  createdAt: Date
  knowledgeUsed: unknown
}

interface OutcomeRow {
  generationId: string
  collectWindowDay: number
  collectedAt: Date
  qualifiedCommentCount: number | null
  dmCount: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: unknown
  userVerdict: string | null
}

/** prisma 的最小投影（便于注入测试替身）。 */
export interface WeeklyReviewStorePort {
  aimGeneration: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<GenerationRow[]>
  }
  contentOutcome: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<OutcomeRow[]>
  }
}

const DAY_MS = 24 * 3600 * 1000

function inRange(value: Date | null, start: Date, end: Date): value is Date {
  return value != null && value.getTime() >= start.getTime() && value.getTime() < end.getTime()
}

/** 任一业务字段已填（含显式 0）即视为已回填。 */
function hasAnyBusinessMetric(row: OutcomeRow): boolean {
  return [
    row.qualifiedCommentCount,
    row.dmCount,
    row.qualifiedLeadCount,
    row.appointmentCount,
    row.dealCount,
    row.revenue,
    row.userVerdict,
  ].some((value) => value != null && value !== "")
}

function sumPeriodSnapshotDeltas(
  rows: OutcomeRow[],
  start: Date,
  end: Date,
  pick: (row: OutcomeRow) => number | null,
): number {
  const endSnapshots = pickPeriodEndSnapshots(
    rows.filter((row) => row.collectedAt.getTime() < end.getTime()),
  )
  const startSnapshots = new Map(
    pickPeriodEndSnapshots(
      rows.filter((row) => row.collectedAt.getTime() < start.getTime()),
    ).map((row) => [row.generationId, row]),
  )
  let total = 0
  for (const endRow of endSnapshots) {
    const endValue = pick(endRow)
    if (endValue == null || !Number.isFinite(endValue)) continue
    const startRow = startSnapshots.get(endRow.generationId)
    const startValue = startRow ? pick(startRow) : null
    total += startValue != null && Number.isFinite(startValue)
      ? endValue - startValue
      : endValue
  }
  return total
}

/**
 * 7/14/30 为累计快照：同一 generation 只保留周期内最成熟窗口
 *（collectWindowDay 最大；并列取 collectedAt 最新），禁止三窗直接相加。
 */
export function pickPeriodEndSnapshots(rows: OutcomeRow[]): OutcomeRow[] {
  const best = new Map<string, OutcomeRow>()
  for (const row of rows) {
    const prev = best.get(row.generationId)
    if (!prev) {
      best.set(row.generationId, row)
      continue
    }
    if (row.collectWindowDay > prev.collectWindowDay) {
      best.set(row.generationId, row)
      continue
    }
    if (
      row.collectWindowDay === prev.collectWindowDay &&
      row.collectedAt.getTime() > prev.collectedAt.getTime()
    ) {
      best.set(row.generationId, row)
    }
  }
  return [...best.values()]
}

function extractKnowledgeIds(knowledgeUsed: unknown): string[] {
  if (!Array.isArray(knowledgeUsed)) return []
  const ids: string[] = []
  for (const item of knowledgeUsed) {
    if (typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string") {
      ids.push((item as { id: string }).id)
    }
  }
  return ids
}

async function loadWeeklyReviewRows(input: {
  userId?: string
  projectId?: string
  generationIds?: string[]
  store: WeeklyReviewStorePort
}) {
  const where = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.generationIds ? { id: { in: input.generationIds } } : {}),
  }
  const outcomeWhere = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.generationIds
      ? { generationId: { in: input.generationIds } }
      : {}),
  }
  return Promise.all([
    input.store.aimGeneration.findMany({ where, take: 1000 }),
    input.store.contentOutcome.findMany({ where: outcomeWhere, take: 5000 }),
  ])
}

/**
 * 计算 [start, end) 周期的经营复盘指标。
 */
/**
 * @description 计算weeklyreview
 * @param input - 输入数据
 * @returns Promise<WeeklyReviewMetrics>
 */
export async function computeWeeklyReview(input: {
  userId?: string
  projectId?: string
  generationIds?: string[]
  start: Date
  end: Date
  store: WeeklyReviewStorePort
}): Promise<WeeklyReviewMetrics> {
  const { start, end } = input
  const [generations, outcomes] = await loadWeeklyReviewRows(input)

  // 1. 发布内容数
  const publishedCount = generations.filter(
    (g) => g.workflowStatus === "published" && inRange(g.publishedAt, start, end),
  ).length

  // 2/3/4. 周期经营结果：周期末累计快照减周期初快照，避免跨周重复计数
  const qualifiedLeadCount = sumPeriodSnapshotDeltas(
    outcomes, start, end, (o) => o.qualifiedLeadCount,
  )
  const appointmentCount = sumPeriodSnapshotDeltas(
    outcomes, start, end, (o) => o.appointmentCount,
  )
  const dealCount = sumPeriodSnapshotDeltas(
    outcomes, start, end, (o) => o.dealCount,
  )
  const revenue = sumPeriodSnapshotDeltas(outcomes, start, end, (o) => {
    if (o.revenue == null) return null
    const value = Number(o.revenue)
    return Number.isFinite(value) ? value : null
  })

  // 5. 知识/案例资产复用（周期内生成的内容引用的资产）
  const usage = new Map<string, number>()
  for (const generation of generations.filter((g) => inRange(g.createdAt, start, end))) {
    for (const id of extractKnowledgeIds(generation.knowledgeUsed)) {
      usage.set(id, (usage.get(id) ?? 0) + 1)
    }
  }
  let reusedAssetCount = 0
  for (const count of usage.values()) {
    if (count >= 2) reusedAssetCount += 1
  }

  // 第 7 天回填率：publishedAt <= end-7d 的已发布内容中，第 7 天窗口已回填的比例
  const dueGenerations = generations.filter(
    (g) =>
      g.workflowStatus === "published" &&
      g.publishedAt != null &&
      g.publishedAt.getTime() + 7 * DAY_MS <= end.getTime(),
  )
  const filled = dueGenerations.filter((g) =>
    outcomes.some(
      (o) => o.generationId === g.id && o.collectWindowDay === 7 && hasAnyBusinessMetric(o),
    ),
  ).length

  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    publishedCount,
    qualifiedLeadCount,
    appointmentCount,
    dealCount,
    revenue,
    referencedAssetCount: usage.size,
    reusedAssetCount,
    day7Backfill: { due: dueGenerations.length, filled },
  }
}
