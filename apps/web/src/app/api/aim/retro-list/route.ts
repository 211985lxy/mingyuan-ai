import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { parseQuery } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  projectId: z.string().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

type RetroSnapshotLike = {
  summary?: string
  actualData?: string
  verdict?: string
  nextRule?: string
  createdAt?: string
}

type RetroListOutcomeRow = {
  collectWindowDay: number
  platform: string | null
  views: number | null
  likes: number | null
  comments: number | null
  dmCount: number | null
  qualifiedLeadCount: number | null
  dealCount: number | null
  verdictCode: string | null
}

type RetroListRecord = {
  id: string
  topicTitle: string | null
  rawInput: string
  rawCopy: string | null
  videoScript: string | null
  workflowStatus: string
  publishPlatform: string | null
  publishedAt: Date | null
  updatedAt: Date
  retroSnapshots: unknown
  contentOutcomes: RetroListOutcomeRow[]
}

const RETRO_LIST_SELECT = {
  id: true,
  topicTitle: true,
  rawInput: true,
  rawCopy: true,
  videoScript: true,
  workflowStatus: true,
  publishPlatform: true,
  publishedAt: true,
  updatedAt: true,
  retroSnapshots: true,
  contentOutcomes: {
    select: {
      collectWindowDay: true,
      platform: true,
      views: true,
      likes: true,
      comments: true,
      dmCount: true,
      qualifiedLeadCount: true,
      dealCount: true,
      verdictCode: true,
    },
    orderBy: { collectWindowDay: "asc" as const },
    take: 3,
  },
}

function readSnapshots(value: unknown): RetroSnapshotLike[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is RetroSnapshotLike =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  )
}

function pickTitle(record: {
  topicTitle: string | null
  rawInput: string
  rawCopy: string | null
  videoScript: string | null
}): string {
  const topic = record.topicTitle?.trim()
  if (topic) return topic.slice(0, 80)
  const body = (record.rawCopy || record.videoScript || record.rawInput || "").trim()
  return body.slice(0, 80) || "未命名内容"
}

function toRetroListItem(record: RetroListRecord) {
  const snapshots = readSnapshots(record.retroSnapshots)
  const latestRetro = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
  const platform =
    record.contentOutcomes.find((o) => o.platform)?.platform
    || record.publishPlatform
    || null

  return {
    id: record.id,
    title: pickTitle(record),
    workflowStatus: record.workflowStatus,
    platform,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    outcomeWindows: record.contentOutcomes.map((o) => o.collectWindowDay),
    hasOutcome: record.contentOutcomes.length > 0,
    hasRetro: snapshots.length > 0,
    latestRetroSummary: latestRetro?.summary?.slice(0, 120) ?? null,
    outcomes: record.contentOutcomes,
    latestRetro,
  }
}

/** 复盘列表：已发布或已有发布数据/复盘快照的内容，供选中挂数据与追溯。 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const { projectId, limit = 30 } = parseQuery(request, querySchema)

    const records = await prisma.aimGeneration.findMany({
      where: {
        userId: user.id,
        ...(projectId ? { projectId } : {}),
        OR: [
          { workflowStatus: "published" },
          { contentOutcomes: { some: {} } },
          { NOT: { retroSnapshots: { equals: [] } } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: RETRO_LIST_SELECT,
    })

    const items = (records as unknown as RetroListRecord[]).map(toRetroListItem)
    return NextResponse.json({ items })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "复盘列表读取失败" },
      { status: 500 },
    )
  }
}
