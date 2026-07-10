import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
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

type FindUniqueDelegate = {
  findUnique(args: unknown): Promise<Record<string, unknown> | null>
}

function getTraceDelegate(): FindUniqueDelegate | undefined {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: FindUniqueDelegate
  }).aimExecutionTrace
}

function getSnapshotDelegate(): FindUniqueDelegate | undefined {
  return (prisma as typeof prisma & {
    aimRunSnapshot?: FindUniqueDelegate
  }).aimRunSnapshot
}

export const GET = withAdminAuth(async (_request: NextRequest, { params }) => {
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
    trace = await traceDelegate.findUnique({ where: { runId } })
  }
  if (snapshotDelegate) {
    snapshot = await snapshotDelegate.findUnique({ where: { runId } })
  }

  if (!trace && !snapshot) {
    return NextResponse.json({ error: "未找到该 runId 的运行记录" }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      runId,
      // long-term metadata (survives snapshot expiry)
      trace: trace ?? null,
      // full snapshot (may be null after 30-day cleanup)
      snapshot: snapshot ?? null,
      snapshotExpired: !snapshot,
    },
  })
})
