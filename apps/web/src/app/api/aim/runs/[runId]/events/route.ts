import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import {
  aimRunEventBodySchema,
  type AimRunEventBody,
} from "@/features/aim/contracts/api"
import {
  buildAimRunEventMetadata,
  isPrismaUniqueConstraintError,
  toPrismaJson,
} from "@/lib/aim/aim-run-event-write"
import { parseRunOutcomeMetadata } from "@/lib/aim/run-outcome-telemetry"
import { writeFinalRunOutcome } from "@/lib/aim/run-outcome-write-service"

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

async function writeWebFinalDisposition(
  runId: string,
  userId: string,
  body: AimRunEventBody,
  reason?: string,
) {
  const outcome = parseRunOutcomeMetadata({
    ...(body.metadata as Record<string, unknown> | undefined),
    channel: "web",
    reasonCode:
      (body.metadata as Record<string, unknown> | undefined)?.reasonCode ?? reason,
  })
  if (!outcome) {
    return NextResponse.json(
      { error: "final_disposition 缺少完整 RunOutcomeMetadata" },
      { status: 400 },
    )
  }
  const result = await writeFinalRunOutcome({ runId, userId, channel: "web", outcome })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.code === "RUN_NOT_FOUND" ? 404 : 400 },
    )
  }
  return NextResponse.json(
    { ok: true, deduped: result.deduped, id: result.id },
    { status: result.deduped ? 200 : 201 },
  )
}

async function writeLegacyRunEvent(
  runId: string,
  userId: string,
  body: AimRunEventBody,
  reason?: string,
) {
  const ownedRun = await prisma.aimExecutionTrace.findFirst({
    where: { runId, userId },
    select: { id: true, durationMs: true, totalTokens: true, costCny: true },
  })
  if (!ownedRun) {
    return NextResponse.json({ error: "执行记录不存在" }, { status: 404 })
  }
  const metadata = buildAimRunEventMetadata({
    bodyMetadata: body.metadata as Record<string, unknown> | undefined,
    reason,
    runId,
    trace: ownedRun,
  })
  try {
    const created = await prisma.aimRunEvent.create({
      data: {
        runId,
        userId,
        event: body.event,
        requestId:
          typeof metadata.requestId === "string" && metadata.requestId.trim()
            ? metadata.requestId.trim()
            : null,
        metadata: toPrismaJson(metadata),
      },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error) || typeof metadata.requestId !== "string") throw error
    const duplicate = await prisma.aimRunEvent.findUnique({
      where: { userId_runId_requestId: { userId, runId, requestId: metadata.requestId } },
      select: { id: true },
    })
    if (!duplicate) throw error
    return NextResponse.json({ ok: true, deduped: true, id: duplicate.id }, { status: 200 })
  }
}

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

    const reason = typeof body.reason === "string" && VALID_REASONS.has(body.reason)
      ? body.reason
      : undefined
    if (body.event === "final_disposition") {
      return writeWebFinalDisposition(runId, user.id, body, reason)
    }
    return writeLegacyRunEvent(runId, user.id, body, reason)
  } catch (error) {
    return authErrorResponse(error) ?? apiRequestErrorResponse(request, error) ?? NextResponse.json(
      { error: "运行事件记录失败" },
      { status: 500 },
    )
  }
}
