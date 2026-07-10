import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

const EVENTS = new Set(["copied", "revised", "accepted"])

type RouteContext = { params: Promise<{ runId: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await authenticateRequest(request)
    const { runId } = await context.params
    const body = await request.json().catch(() => ({})) as {
      event?: unknown
      metadata?: unknown
    }

    if (!runId.startsWith("run_") || runId.length > 40) {
      return NextResponse.json({ error: "无效的执行编号" }, { status: 400 })
    }
    if (typeof body.event !== "string" || !EVENTS.has(body.event)) {
      return NextResponse.json({ error: "无效的运行事件" }, { status: 400 })
    }

    const ownedRun = await prisma.aimExecutionTrace.findFirst({
      where: { runId, userId: user.id },
      select: { id: true },
    })
    if (!ownedRun) {
      return NextResponse.json({ error: "执行记录不存在" }, { status: 404 })
    }

    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata
      : undefined
    await prisma.aimRunEvent.create({
      data: {
        runId,
        userId: user.id,
        event: body.event,
        metadata,
      },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "运行事件记录失败" },
      { status: 500 },
    )
  }
}
