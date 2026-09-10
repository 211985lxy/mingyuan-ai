import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { runOperationalAlertChecks } from "@/lib/operational-alerts"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const result = await runOperationalAlertChecks()
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: "告警检查失败" }, { status: 503 })
  }
}
