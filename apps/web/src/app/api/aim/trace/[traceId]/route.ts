import { NextRequest } from "next/server"
import { redis } from "@/lib/redis"
import Redis from "ioredis"

const TRACE_CHANNEL_PREFIX = "aim:trace:"
const SSE_TIMEOUT_MS = 90_000 // 90 秒无新事件自动关闭

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  // 认证检查
  const authError = await authenticateSafe(request)
  if (authError) return authError

  const { traceId } = await params
  if (!traceId || traceId.length > 100) {
    return new Response("Invalid traceId", { status: 400 })
  }

  const channel = `${TRACE_CHANNEL_PREFIX}${traceId}`
  const encoder = new TextEncoder()

  // 创建独立的 subscriber 连接（ioredis 不允许 subscriber 在非 subscriber 模式下使用）
  // 从主客户端的连接配置派生新的连接参数
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
        // fire-and-forget cleanup
        Promise.allSettled([
          subscriber.unsubscribe(channel),
          subscriber.disconnect(),
        ])
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
          // 收到完成/失败/超时事件后关闭
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
    // 复用 user-auth 的 authenticateRequest，但如果 DB 不可用也不应阻塞 SSE
    const { authenticateRequest } = await import("@/lib/user-auth")
    await authenticateRequest(request)
    return null
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }
}
