import { NextRequest } from "next/server"
import Redis from "ioredis"
import { prisma } from "@/lib/prisma"
import { readBufferedTraceEvents } from "@/lib/aim-observability"

const TRACE_CHANNEL_PREFIX = "aim:trace:"
const SSE_TIMEOUT_MS = 90_000 // 90 秒无新事件自动关闭

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  // 认证检查（Authorization: Bearer，前端以 fetch 流式读取代替 EventSource 以携带请求头）
  const auth = await authenticateSafe(request)
  if (auth.error) return auth.error

  const { traceId } = await params
  if (!traceId || traceId.length > 100) {
    return new Response("Invalid traceId", { status: 400 })
  }

  // 归属校验：trace 必须存在且属于当前登录用户，防止跨用户订阅他人思考过程
  const ownerId = await findTraceOwnerId(traceId)
  if (!ownerId) {
    return new Response("Trace not found", { status: 404 })
  }
  if (ownerId !== auth.user?.id) {
    return new Response("Forbidden", { status: 403 })
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
      let closed = false
      // 已转发的事件去重（缓冲回放与实时订阅可能重叠）
      const sentPayloads = new Set<string>()
      // 订阅成功后、缓冲回放完成前到达的实时消息，先排队保住时序
      const liveQueue: string[] = []
      let replaying = true

      function resetTimeout() {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        timeoutTimer = setTimeout(() => {
          sendSSE(JSON.stringify({ type: "timeout" }))
          closeStream()
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

      function closeStream() {
        if (closed) return
        closed = true
        cleanup()
        try { controller.close() } catch { /* already closed */ }
      }

      function sendSSE(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        resetTimeout()
      }

      function forward(message: string) {
        if (closed || sentPayloads.has(message)) return
        sentPayloads.add(message)
        try {
          const parsed = JSON.parse(message)
          sendSSE(JSON.stringify(parsed))
          // 收到完成/失败/超时事件后关闭
          if (parsed.type === "done" || parsed.type === "error" || parsed.type === "timeout") {
            closeStream()
          }
        } catch {
          // 非 JSON 消息忽略
        }
      }

      // 发送初始 SSE 心跳
      sendSSE(JSON.stringify({ type: "connected", traceId }))

      // 订阅 Redis channel
      try {
        await subscriber.subscribe(channel)
      } catch {
        sendSSE(JSON.stringify({ type: "error", message: "Redis subscribe failed" }))
        closeStream()
        return
      }

      subscriber.on("message", (_ch: string, message: string) => {
        if (replaying) {
          liveQueue.push(message)
          return
        }
        forward(message)
      })

      subscriber.on("error", () => {
        sendSSE(JSON.stringify({ type: "error", message: "Redis connection error" }))
        closeStream()
      })

      // 先回放缓冲事件：generate 是非流式接口，前端拿到 traceId 时全部事件
      // 往往已发布完毕，Pub/Sub 不保留历史，必须靠回放补齐。
      const history = await readBufferedTraceEvents(traceId)
      for (const message of history) {
        forward(message)
        if (closed) return
      }
      replaying = false
      // 再转发回放期间通过订阅收到的实时消息（去重后保序）
      for (const message of liveQueue) {
        forward(message)
        if (closed) return
      }

      // 客户端断开时清理
      request.signal.addEventListener("abort", () => {
        closeStream()
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
      // 同源接口，不下发 Access-Control-Allow-Origin（此前为 *，存在跨站订阅风险）
    },
  })
}

/** 查询 trace 归属用户；trace 不存在或无归属时返回 null */
async function findTraceOwnerId(traceId: string): Promise<string | null> {
  try {
    const delegate = (prisma as typeof prisma & {
      aimExecutionTrace?: {
        findUnique(args: unknown): Promise<{ userId: string | null } | null>
      }
    }).aimExecutionTrace
    if (!delegate) return null
    const record = await delegate.findUnique({
      where: { id: traceId },
      select: { userId: true },
    })
    return record?.userId ?? null
  } catch {
    return null
  }
}

/** 轻量级认证检查，失败时返回 Response 而非抛异常 */
async function authenticateSafe(
  request: NextRequest,
): Promise<{ user: { id: string } | null; error: Response | null }> {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return { user: null, error: new Response("Unauthorized", { status: 401 }) }
    }
    // 复用 user-auth 的 authenticateRequest，但如果 DB 不可用也不应阻塞 SSE
    const { authenticateRequest } = await import("@/lib/user-auth")
    const user = await authenticateRequest(request)
    return { user: { id: user.id }, error: null }
  } catch {
    return { user: null, error: new Response("Unauthorized", { status: 401 }) }
  }
}
