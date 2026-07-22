import { NextRequest } from "next/server"
import { redis } from "@/lib/redis"
import { prisma } from "@/lib/prisma"
import Redis from "ioredis"

const TRACE_CHANNEL_PREFIX = "aim:trace:"
const SSE_TIMEOUT_MS = 90_000 // 90 秒无新事件自动关闭

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  const authError = await authenticateSafe(request)
  if (authError) return authError

  const { traceId } = await params
  if (!traceId || traceId.length > 100) {
    return new Response("Invalid traceId", { status: 400 })
  }

  const channel = `${TRACE_CHANNEL_PREFIX}${traceId}`
  const encoder = new TextEncoder()

  const subscriber = new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    {
      maxRetriesPerRequest: 5,
      lazyConnect: true,
      connectTimeout: 5000,
    },
  )

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined

  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        resetTimeout()
      }

      function resetTimeout() {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        timeoutTimer = setTimeout(() => {
          sendSSE(JSON.stringify({ type: "timeout" }))
          cleanup()
          try { controller.close() } catch { /* already closed */ }
        }, SSE_TIMEOUT_MS)
      }

      function cleanup() {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        Promise.allSettled([
          subscriber.unsubscribe(channel),
          subscriber.disconnect(),
        ])
      }

      // DB 回放：先读取已有步骤作为兜底（修复时序竞态）
      try {
        const delegate = (prisma as typeof prisma & {
          aimExecutionTrace?: { findUnique(args: unknown): Promise<{ steps: unknown } | null> }
        }).aimExecutionTrace
        if (delegate?.findUnique) {
          const record = await delegate.findUnique({
            where: { id: traceId },
            select: { steps: true },
          })
          const existingSteps = Array.isArray(record?.steps) ? record.steps as unknown[] : []
          for (const step of existingSteps) {
            sendSSE(JSON.stringify({ type: "replay", step }))
          }
          // 如果 trace 已完成，回放完直接关闭
          const status = (record as Record<string, unknown>)?.status
          if (status === "success" || status === "failed") {
            sendSSE(JSON.stringify({ type: "done", status }))
            cleanup()
            try { controller.close() } catch { /* already closed */ }
            return
          }
        }
      } catch {
        // DB 读取失败不影响实时订阅
      }

      // 发送初始 SSE 心跳
      sendSSE(JSON.stringify({ type: "connected", traceId }))

      // 订阅 Redis channel
      try {
        await subscriber.subscribe(channel)
      } catch {
        sendSSE(JSON.stringify({ type: "error", message: "Redis subscribe failed" }))
        cleanup()
        try { controller.close() } catch { /* already closed */ }
        return
      }

      subscriber.on("message", (_ch: string, message: string) => {
        try {
          const parsed = JSON.parse(message)
          sendSSE(JSON.stringify(parsed))
          if (parsed.type === "done" || parsed.type === "error" || parsed.type === "timeout") {
            cleanup()
            try { controller.close() } catch { /* already closed */ }
          }
        } catch {
          // 非 JSON 消息忽略
        }
      })

      subscriber.on("error", () => {
        sendSSE(JSON.stringify({ type: "error", message: "Redis connection error" }))
        cleanup()
        try { controller.close() } catch { /* already closed */ }
      })

      // 客户端断开时清理
      request.signal.addEventListener("abort", () => {
        cleanup()
        try { controller.close() } catch { /* already closed */ }
      })
    },
    cancel() {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      try { subscriber.disconnect() } catch { /* ignore */ }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

/** 轻量级认证检查，失败时返回 Response 而非抛异常 */
async function authenticateSafe(request: NextRequest): Promise<Response | null> {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 })
    }
    const { authenticateRequest } = await import("@/lib/user-auth")
    await authenticateRequest(request)
    return null
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }
}
