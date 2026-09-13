import { NextRequest, NextResponse } from "next/server"
import { authorizeCronJob } from "@/lib/aim/cron-job-guard"
import { runAuditReconcileBatch } from "@/lib/audit-reconcile"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const denied = await authorizeCronJob(request, "audit-reconcile")
  if (denied) return denied
  const searchParams = new URL(request.url).searchParams
  const rawLimit = Number(searchParams.get("limit") || "100")
  try {
    const result = await runAuditReconcileBatch(new Date(), Number.isFinite(rawLimit) ? rawLimit : 100)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid audit reconciliation request" }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
