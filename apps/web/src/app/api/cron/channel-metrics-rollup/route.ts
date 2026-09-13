import { NextRequest, NextResponse } from "next/server"
import { authorizeCronJob } from "@/lib/aim/cron-job-guard"
import { rollupChannelMetricDay } from "@/lib/channel-metrics"
import { shanghaiDateText } from "@/lib/shanghai-time"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}

async function run(request: NextRequest) {
  const denied = await authorizeCronJob(request, "channel-metrics-rollup")
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const day = params.get("day")?.trim() || shanghaiDateText(new Date(Date.now() - 24 * 60 * 60 * 1000))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "day 必须是 YYYY-MM-DD" }, { status: 400 })
  const platform = params.get("platform")?.trim() || undefined
  const result = await rollupChannelMetricDay(day, platform)
  return NextResponse.json({ ok: result.failed === 0, day, platform: platform || null, ...result }, { status: result.failed > 0 ? 503 : 200 })
}
