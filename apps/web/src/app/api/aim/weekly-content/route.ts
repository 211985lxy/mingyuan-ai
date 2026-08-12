import { NextRequest, NextResponse } from "next/server"

import { buildWeeklyContentBoard } from "@/lib/aim/weekly-content-board"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value: string | null, fallback: Date): Date | null {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || ""
    if (!projectId || projectId.length > 80) return NextResponse.json({ error: "请选择项目" }, { status: 400 })
    const project = await prisma.clientProject.findFirst({
      where: { id: projectId, userId: user.id, status: "active" },
      select: { id: true },
    })
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 })
    const defaultEnd = new Date()
    const defaultStart = new Date(defaultEnd.getTime() - 7 * DAY_MS)
    const start = parseDate(request.nextUrl.searchParams.get("start"), defaultStart)
    const end = parseDate(request.nextUrl.searchParams.get("end"), defaultEnd)
    if (!start || !end || start >= end) return NextResponse.json({ error: "日期范围不合法" }, { status: 400 })
    const [selections, generations] = await Promise.all([
      prisma.topicSelection.findMany({
        where: { userId: user.id, projectId, createdAt: { gte: start, lt: end } },
        select: { id: true, candidates: true, sourceHighlights: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.aimGeneration.findMany({
        where: { userId: user.id, projectId, topicSelectionId: { not: null }, createdAt: { lt: end } },
        select: { id: true, topicSelectionId: true, selectedTopicIndex: true, workflowStatus: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
    ])
    return NextResponse.json({ items: buildWeeklyContentBoard({ selections, generations }) })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "本周内容读取失败" }, { status: 500 })
  }
}
