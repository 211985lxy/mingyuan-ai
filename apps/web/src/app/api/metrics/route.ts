import { NextRequest, NextResponse } from "next/server"
import { env } from "@/env"
import { safeSecretEqual } from "@/lib/aim/work-item-api-auth"
import { metricsRegistry } from "@/lib/metrics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * @description 处理 GET 请求
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  const secret = env.METRICS_SCRAPE_SECRET
  const authorization = request.headers.get("authorization") || ""
  if (!secret || secret.length < 32 || !safeSecretEqual(`Bearer ${secret}`, authorization)) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const metrics = await metricsRegistry.metrics()
  return new NextResponse(metrics, {
    headers: {
      "Content-Type": metricsRegistry.contentType,
    },
  })
}
