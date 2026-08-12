import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  captureLearningCandidates,
} from "@/lib/aim/learning-candidate-capture"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
const DAY_MS = 24 * 60 * 60 * 1000

function date(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

export const GET = withAdminOnly(async (request: NextRequest) => {
  const reviewStatus = request.nextUrl.searchParams.get("reviewStatus")?.trim()
  const targetType = request.nextUrl.searchParams.get("targetType")?.trim()
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim()
  const rows = await prisma.learningCandidate.findMany({
    where: {
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(targetType ? { targetType } : {}),
      ...(projectId ? { projectId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  })
  return NextResponse.json({ items: rows })
})

export const POST = withAdminOnly(async (request: NextRequest, { admin }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  if (body.mode !== "capture") {
    return NextResponse.json({ error: "mode 必须是 capture" }, { status: 400 })
  }
  const parsedEnd = date(body.end)
  const parsedStart = date(body.start)
  if (
    (body.end !== undefined && !parsedEnd)
    || (body.start !== undefined && !parsedStart)
  ) return NextResponse.json({ error: "start/end 必须是有效日期" }, { status: 400 })
  const end = parsedEnd ?? new Date()
  const start = parsedStart ?? new Date(end.getTime() - 7 * DAY_MS)
  if (
    start >= end
    || end.getTime() - start.getTime() > 31 * DAY_MS
  ) return NextResponse.json({ error: "采集周期必须有效且不超过 31 天" }, { status: 400 })
  try {
    const result = await captureLearningCandidates({ start, end })
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "learning_candidate.capture",
      targetType: "learning_candidate",
      targetId: `${start.toISOString()}..${end.toISOString()}`,
      metadata: result,
    })
    return NextResponse.json({ result }, {
      headers: { "x-request-id": requestId },
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "学习候选采集失败",
    }, { status: 409 })
  }
})
