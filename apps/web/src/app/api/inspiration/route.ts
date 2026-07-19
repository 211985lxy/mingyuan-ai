import { parseJsonRecord } from "@/lib/api-contract"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { INSPIRATION_PROCESS_TASK_KIND } from "@/features/topics/services/inspiration-background-task"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const url = new URL(request.url)
    const status = url.searchParams.get("status")
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)))
    const items = await prisma.inspiration.findMany({ where: { userId: user.id, ...(status ? { aiStatus: status } : {}) }, orderBy: { createdAt: "desc" }, take: limit })
    return NextResponse.json({ items })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "灵感列表读取失败" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)
    const content = typeof body.content === "string" ? body.content.trim() : ""
    const source = typeof body.source === "string" ? body.source.trim() : "text"
    const autoProcess = body.autoProcess !== false
    if (!content) return NextResponse.json({ error: "灵感内容不能为空" }, { status: 400 })
    if (content.length > 10_000) return NextResponse.json({ error: "灵感内容过长，请控制在 10000 字以内" }, { status: 400 })
    const inspiration = await prisma.$transaction(async (tx) => {
      const created = await tx.inspiration.create({ data: { userId: user.id, source, content, aiStatus: autoProcess ? "pending" : "completed" } })
      if (autoProcess) await enqueueBackgroundTask(tx as never, { kind: INSPIRATION_PROCESS_TASK_KIND, aggregateType: "inspiration", aggregateId: created.id, idempotencyKey: `inspiration:${created.id}` })
      return created
    })
    return NextResponse.json(inspiration, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "灵感保存失败" }, { status: 500 })
  }
}
