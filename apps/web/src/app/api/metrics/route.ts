import { NextResponse } from "next/server"
import { metricsRegistry } from "@/lib/metrics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * @description 处理 GET 请求
 * @returns 无返回值
 */
export async function GET() {
  const metrics = await metricsRegistry.metrics()
  return new NextResponse(metrics, {
    headers: {
      "Content-Type": metricsRegistry.contentType,
    },
  })
}
