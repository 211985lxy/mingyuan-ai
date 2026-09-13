/**
 * 当日选题快照：早/中/晚三报共用的读取入口。
 * 只读、零 LLM 成本；三张卡片的差异在各自的渲染层，数据源保持一处。
 */
import { prisma } from "@/lib/prisma"

export interface DailySelectionSummary {
  selectionId: string
  reviewStatus: string
  selectedIndex: number | null
  candidates: unknown
}

export interface DailyTopicSnapshot {
  selections: DailySelectionSummary[]
  inspirationCount: number
  inspirationExtracted: number
  inspirationFailed: number
  /** 最近一次抖音热榜快照时间；null 表示采集停摆 */
  hotSnapshotAt: Date | null
}

/** 取候选标题（用于「选了哪张」的展示）；下标为空或越界时返回 null。 */
export function candidateTitle(candidates: unknown, index: number | null): string | null {
  if (index === null) return null
  if (!Array.isArray(candidates)) return null
  const card = candidates[index] as { title?: unknown } | undefined
  return typeof card?.title === "string" ? card.title : null
}

/**
 * @description 读取当日选题批次、当日灵感与热点采集健康度
 * @param userId - 运营者用户 ID
 * @returns 三报共用快照
 */
export async function loadDailyTopicSnapshot(userId: string): Promise<DailyTopicSnapshot> {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const todayKey = new Date().toISOString().split("T")[0]

  const inspirationWhere = { userId, createdAt: { gte: dayStart } }
  const [selectionRows, inspirationCount, inspirationExtracted, inspirationFailed, hotSnapshot] =
    await Promise.all([
      prisma.topicSelection.findMany({
        where: { userId, recommendationMode: "daily", recommendedDate: todayKey },
        orderBy: { createdAt: "asc" },
        select: { id: true, reviewStatus: true, selectedIndex: true, candidates: true },
        take: 50,
      }),
      prisma.inspiration.count({ where: inspirationWhere }),
      prisma.inspiration.count({ where: { ...inspirationWhere, aiStatus: "completed" } }),
      prisma.inspiration.count({ where: { ...inspirationWhere, aiStatus: "failed" } }),
      prisma.douyinHotSnapshot.findFirst({
        orderBy: { fetchedAt: "desc" },
        select: { fetchedAt: true },
      }),
    ])

  return {
    selections: selectionRows.map((row) => ({
      selectionId: row.id,
      reviewStatus: row.reviewStatus,
      selectedIndex: row.selectedIndex,
      candidates: row.candidates as unknown,
    })),
    inspirationCount,
    inspirationExtracted,
    inspirationFailed,
    hotSnapshotAt: hotSnapshot?.fetchedAt ?? null,
  }
}
