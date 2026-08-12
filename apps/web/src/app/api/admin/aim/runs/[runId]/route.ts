import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"

/**
 * Admin run diagnostics — strict admin auth (full snapshot is admin-only).
 *
 * GET /api/admin/aim/runs/:runId returns the full execution trace (long-term
 * fields) joined with the AimRunSnapshot (runSpec, context manifest, provider
 * attempts, full text prompt, output, per-format quality, image hashes). The
 * snapshot may have expired (cleaned by cron/cleanup) while the trace metadata
 * (provider/model/hashes/metrics) remains queryable.
 */

type TraceDelegate = {
  // runId is an indexed (non-unique) column on AimExecutionTrace, so use
  // findFirst; findUnique would fail Prisma validation at runtime.
  findFirst(args: unknown): Promise<Record<string, unknown> | null>
}

type SnapshotDelegate = {
  // runId is @unique on AimRunSnapshot, so findUnique is valid here.
  findUnique(args: unknown): Promise<Record<string, unknown> | null>
}

function getTraceDelegate(): TraceDelegate | undefined {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: TraceDelegate
  }).aimExecutionTrace
}

function getSnapshotDelegate(): SnapshotDelegate | undefined {
  return (prisma as typeof prisma & {
    aimRunSnapshot?: SnapshotDelegate
  }).aimRunSnapshot
}

export const GET = withAdminOnly(async (request: NextRequest, { admin, params }) => {
  const runId = params?.runId
  if (!runId) {
    return NextResponse.json({ error: "缺少 runId" }, { status: 400 })
  }

  const traceDelegate = getTraceDelegate()
  const snapshotDelegate = getSnapshotDelegate()

  // The trace is the long-term record; the snapshot carries the full prompt/
  // output (admin-only, 30-day). Look both up by runId.
  let trace: Record<string, unknown> | null = null
  let snapshot: Record<string, unknown> | null = null

  if (traceDelegate) {
    // runId is non-unique on the trace → findFirst, ordered by most recent.
    trace = await traceDelegate.findFirst({
      where: { runId },
      orderBy: { createdAt: "desc" },
    })
  }
  if (snapshotDelegate) {
    snapshot = await snapshotDelegate.findUnique({ where: { runId } })
  }

  if (!trace && !snapshot) {
    return NextResponse.json({ error: "未找到该 runId 的运行记录" }, { status: 404 })
  }

  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "aim_run_snapshot.read",
    targetType: "aim_run",
    targetId: runId,
    metadata: {
      hasTrace: Boolean(trace),
      hasSnapshot: Boolean(snapshot),
    },
  })

  return NextResponse.json({
    data: {
      runId,
      // long-term metadata (survives snapshot expiry)
      trace: trace ?? null,
      // full snapshot (may be null after 30-day cleanup)
      snapshot: snapshot ?? null,
      snapshotExpired: !snapshot,
    },
  }, { headers: { "x-request-id": requestId } })
})
