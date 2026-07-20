import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { redisConnectionStatus } from "@/lib/metrics"
import { logger } from "@/lib/logger"
import {
  computeFeishuWorkItemReady,
  computeProxyReady,
  getReleaseFacts,
} from "@/lib/release-facts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * @description 处理 GET 请求
 * @returns 无返回值
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}

  // Database check
  const dbStart = Date.now()
  try {
    await prisma.$queryRawUnsafe("SELECT 1")
    checks.database = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (error) {
    logger.warn({ error }, "[healthz] database unavailable")
    checks.database = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: "unavailable",
    }
  }

  // Redis check
  const redisStart = Date.now()
  try {
    await redis.ping()
    checks.redis = { ok: true, latencyMs: Date.now() - redisStart }
    redisConnectionStatus.set(1)
  } catch (error) {
    logger.warn({ error }, "[healthz] redis unavailable")
    checks.redis = {
      ok: false,
      latencyMs: Date.now() - redisStart,
      error: "unavailable",
    }
    redisConnectionStatus.set(0)
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  const releaseFacts = getReleaseFacts()

  return NextResponse.json(
    {
      ok: allOk,
      service: "mingyuan-web",
      timestamp: new Date().toISOString(),
      // 发布事实（非敏感）：线上版本 = 哪个 Git 提交、何时构建
      releaseSha: releaseFacts.releaseSha,
      buildTime: releaseFacts.buildTime,
      version: releaseFacts.version,
      // 能力就绪位（非敏感布尔）：不暴露密钥、Base Token、表 ID 或客户数据
      feishuReady: computeFeishuWorkItemReady(process.env),
      proxyReady: computeProxyReady(process.env),
      checks,
    },
    { status: allOk ? 200 : 503 },
  )
}
