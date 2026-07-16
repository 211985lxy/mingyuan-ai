import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { aimRunEventBodySchema } from "@/features/aim/contracts/api"
import type { Prisma } from "@/generated/prisma/client"

// 事件类型：既有 copied/revised/accepted + 协作认知层反馈事件（补充指令 §五）
// 全部 ≤ 24 字符，适配 AimRunEvent.event @db.VarChar(24)
const EVENTS = new Set([
  "copied", "revised", "accepted",
  "edited", "published", "retrospected",
  "partially_satisfied", "rewrite_requested", "rejected",
])

// 反馈原因（可选；非法值忽略，不报错）
const VALID_REASONS = new Set([
  "fact_inaccurate", "tone_mismatch", "structure_mismatch", "too_generic",
  "conversion_weak", "missing_evidence", "other",
])

type RouteContext = { params: Promise<{ runId: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await authenticateRequest(request)
    const { runId } = await context.params
    const body = await parseJsonBody(request, aimRunEventBodySchema, { maxBytes: 16 * 1024 })

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
    // 可选 reason：仅当属于合法集合时才写入 metadata，避免污染
    const reason = typeof body.reason === "string" && VALID_REASONS.has(body.reason) ? body.reason : undefined
    await prisma.aimRunEvent.create({
      data: {
        runId,
        userId: user.id,
        event: body.event,
        metadata: (metadata ?? (reason ? { reason } : undefined)) as Prisma.InputJsonValue | undefined,
      },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? apiRequestErrorResponse(request, error) ?? NextResponse.json(
      { error: "运行事件记录失败" },
      { status: 500 },
    )
  }
}
