import { NextRequest, NextResponse } from "next/server"
import { authorizeCronJob } from "@/lib/aim/cron-job-guard"
import { deleteExpiredControlCenterRows } from "@/lib/control-center-retention"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}

async function run(request: NextRequest) {
  const denied = await authorizeCronJob(request, "control-center-retention")
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const execute = params.get("execute") === "true"
  if (execute && params.get("confirm") !== "DELETE-180-DAY-ROWS") {
    return NextResponse.json({ error: "真实清理需要 confirm=DELETE-180-DAY-ROWS" }, { status: 400 })
  }
  try {
    const result = await deleteExpiredControlCenterRows({ execute })
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: "控制中心留存清理失败" }, { status: 503 })
  }
}
