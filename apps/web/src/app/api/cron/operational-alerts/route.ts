import { NextRequest, NextResponse } from "next/server"
import { authorizeCronJob } from "@/lib/aim/cron-job-guard"
import { runOperationalAlertChecks } from "@/lib/operational-alerts"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const denied = await authorizeCronJob(request, "operational-alerts")
  if (denied) return denied
  try {
    const result = await runOperationalAlertChecks()
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: "告警检查失败" }, { status: 503 })
  }
}
