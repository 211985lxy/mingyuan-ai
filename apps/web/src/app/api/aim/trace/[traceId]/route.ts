import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { AimTraceStreamBroker } from "@/lib/aim-trace-stream-broker"

const SSE_TIMEOUT_MS = 90_000

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  const auth = await authenticateSafe(request)
  if (auth.error) return auth.error
  const userId = auth.userId!

  const { traceId } = await params
  if (!traceId || traceId.length > 100) {
    return new Response("Invalid traceId", { status: 400 })
  }

  // 归属校验必须在回放与实时订阅之前；非所有者与不存在统一 404
  const record = await prisma.aimExecutionTrace.findFirst({
    where: { id: traceId, userId },
    select: { id: true, userId: true, status: true, steps: true },
  })
  if (!record) {
    return new Response("Not Found", { status: 404 })
  }

  const status = record.status
  const isTerminal = status === "success" || status === "failed"
  const existingSteps = Array.isArray(record.steps) ? (record.steps as unknown[]) : []

  if (!isTerminal) {
    const ready = await AimTraceStreamBroker.getInstance().canAccept(userId)
    if (!ready.ok) {
      return new Response(
        ready.reason === "redis_unavailable" ? "Realtime unavailable" : "Too Many Requests",
        { status: ready.status },
      )
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined
      let liveUnsub: (() => void) | null = null
      let closed = false

      function cleanup() {
        if (closed) return
        closed = true
        if (timeoutTimer) clearTimeout(timeoutTimer)
        if (liveUnsub) {
          liveUnsub()
          liveUnsub = null
        }
      }

      function sendSSE(data: string) {
        if (closed) return
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

      for (const step of existingSteps) {
        sendSSE(JSON.stringify({ type: "replay", step }))
      }

      if (isTerminal) {
        sendSSE(JSON.stringify({ type: "done", status }))
        cleanup()
        try { controller.close() } catch { /* already closed */ }
        return
      }

      sendSSE(JSON.stringify({ type: "connected", traceId }))

      const sub = await AimTraceStreamBroker.getInstance().subscribe({
        userId,
        traceId,
        idleMs: SSE_TIMEOUT_MS,
        onMessage: (message) => {
          try {
            const parsed = JSON.parse(message) as { type?: string }
            sendSSE(JSON.stringify(parsed))
            if (parsed.type === "done" || parsed.type === "error" || parsed.type === "timeout") {
              cleanup()
              try { controller.close() } catch { /* already closed */ }
            }
          } catch {
            // 非 JSON 忽略
          }
        },
      })

      if (!sub.ok) {
        sendSSE(JSON.stringify({
          type: "error",
          message: sub.reason === "redis_unavailable" ? "Realtime unavailable" : "Too Many Requests",
        }))
        cleanup()
        try { controller.close() } catch { /* already closed */ }
        return
      }

      liveUnsub = sub.unsubscribe

      request.signal.addEventListener("abort", () => {
        cleanup()
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

async function authenticateSafe(
  request: NextRequest,
): Promise<{ userId?: string; error?: Response }> {
  try {
    const { authenticateRequest } = await import("@/lib/user-auth")
    const user = await authenticateRequest(request)
    return { userId: user.id }
  } catch {
    return { error: new Response("Unauthorized", { status: 401 }) }
  }
}
