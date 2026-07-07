import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { redisConnectionStatus } from "@/lib/metrics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}

  // Database check
  const dbStart = Date.now()
  try {
    await prisma.$queryRawUnsafe("SELECT 1")
    checks.database = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (error) {
    checks.database = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "unknown",
    }
  }

  // Redis check
  const redisStart = Date.now()
  try {
    await redis.ping()
    checks.redis = { ok: true, latencyMs: Date.now() - redisStart }
    redisConnectionStatus.set(1)
  } catch (error) {
    checks.redis = {
      ok: false,
      latencyMs: Date.now() - redisStart,
      error: error instanceof Error ? error.message : "unknown",
    }
    redisConnectionStatus.set(0)
  }

  const allOk = Object.values(checks).every((c) => c.ok)

  return NextResponse.json(
    {
      ok: allOk,
      service: "mingyuan-web",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  )
}
