import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { aimRunEventBodySchema } from "@/features/aim/contracts/api"
import {
  buildAimRunEventMetadata,
  findDuplicateEventByRequestId,
  toPrismaJson,
  validateFinalDispositionEvent,
} from "@/lib/aim/aim-run-event-write"

const EVENTS = new Set([
  "copied", "revised", "accepted",
  "edited", "published", "retrospected",
  "partially_satisfied", "rewrite_requested", "rejected",
  "abandoned", "final_disposition",
  "accepted_first_pass", "accepted_after_edit",
])

const VALID_REASONS = new Set([
  "fact_inaccurate", "tone_mismatch", "structure_mismatch", "too_generic",
  "conversion_weak", "missing_evidence", "other",
])

type RouteContext = { params: Promise<{ runId: string }> }

/**
 * @description 处理 POST 请求：记录 AIM 运行事件（含终态处置）
 */
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
      select: { id: true, durationMs: true, costCny: true },
    })
    if (!ownedRun) {
      return NextResponse.json({ error: "执行记录不存在" }, { status: 404 })
    }

    const reason = typeof body.reason === "string" && VALID_REASONS.has(body.reason)
      ? body.reason
      : undefined
    const metadata = buildAimRunEventMetadata({
      bodyMetadata: body.metadata as Record<string, unknown> | undefined,
      reason,
      runId,
      trace: ownedRun,
    })

    const dispositionError = validateFinalDispositionEvent(body.event, metadata)
    if (dispositionError) {
      return NextResponse.json({ error: dispositionError }, { status: 400 })
    }

    if (typeof metadata.requestId === "string" && metadata.requestId.trim()) {
      const recent = await prisma.aimRunEvent.findMany({
        where: { runId, userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, metadata: true },
      })
      const duplicate = findDuplicateEventByRequestId(recent, metadata.requestId.trim())
      if (duplicate) {
        return NextResponse.json({ ok: true, deduped: true, id: duplicate.id }, { status: 200 })
      }
    }

    const created = await prisma.aimRunEvent.create({
      data: {
        runId,
        userId: user.id,
        event: body.event,
        metadata: toPrismaJson(metadata),
      },
    })

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? apiRequestErrorResponse(request, error) ?? NextResponse.json(
      { error: "运行事件记录失败" },
      { status: 500 },
    )
  }
}
