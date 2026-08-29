/**
 * AIM chat response construction (streaming and JSON).
 *
 * Extracted from chat-context.ts (WP-3).
 */
import {
  addAimTraceStep,
  failAimTrace,
  finishAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { NextResponse } from "next/server"
import { streamAimChatDomain } from "@/lib/aim-harness/domain-executor"

/** Wrap an async iterable of text chunks into a streaming Response. */
/**
 * @description streamchatcontent
 * @param chunks - chunks
 * @param trace? - trace?
 * @param options? - options?
 * @returns 无返回值
 */
export function streamChatContent(
  chunks: AsyncIterable<string>,
  trace?: AimTraceRecorder,
  options?: { runId?: string; finalize?: (output: string, ok: boolean) => Promise<void> },
) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(controller) {
        const startedAt = Date.now()
        let output = ""
        try {
          for await (const chunk of chunks) {
            output += chunk
            controller.enqueue(encoder.encode(chunk))
          }
          await addAimTraceStep(trace, {
            key: "llm_stream_chat",
            label: "LLM 流式聊天生成",
            status: "success",
            durationMs: Date.now() - startedAt,
            outputSummary: summarizeText(output),
          })
          await finishAimTrace(trace, { outputSummary: summarizeText(output) })
          await options?.finalize?.(output, true)
          controller.close()
        } catch (error) {
          // 先把错误送达流（前端立即停止等待），观测与收尾写入不得阻塞错误传播：
          // 它们一旦挂起/抛错会导致流永不关闭，前端表现为无限「思考中」。
          controller.error(error)
          try {
            await addAimTraceStep(trace, {
              key: "llm_stream_chat",
              label: "LLM 流式聊天生成",
              status: "failed",
              durationMs: Date.now() - startedAt,
              error: error instanceof Error ? error.message : String(error),
            })
            await failAimTrace(trace, error)
          } catch (traceError) {
            console.error("[aim/chat/stream] trace 记录失败（不影响错误已送达前端）:", traceError)
          }
          try {
            await options?.finalize?.(output, false)
          } catch (finalizeError) {
            console.error("[aim/chat/stream] finalize 失败（不影响错误已送达前端）:", finalizeError)
          }
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        ...(options?.runId ? { "X-AIM-Run-Id": options.runId } : {}),
      },
    },
  )
}

/**
 * Build a streaming chat response.
 *
 * Does NOT call streamAimRun — the caller (route) holds the stream to
 * satisfy architecture guardrail R1.
 */
/**
 * @description 构建aimchatstreamresponse
 * @param streamRun - 流Run
 * @returns 无返回值
 */
export function buildAimChatStreamResponse(
  streamRun: {
    spec: unknown
    runId: string
    stream: (chunks: AsyncIterable<string>) => AsyncIterable<string>
    finalize: (output: string, ok: boolean) => Promise<void>
  },
  chatParams: unknown,
  trace?: AimTraceRecorder,
) {
  return streamChatContent(
    streamRun.stream(streamAimChatDomain(streamRun.spec as never, chatParams as never)),
    trace,
    { runId: streamRun.runId, finalize: streamRun.finalize },
  )
}

/** Build a non-streaming JSON response from a completed chat run. */
/**
 * @description 构建aimchatjsonresponse
 * @param chatRun - 聊天Run
 * @returns 无返回值
 */
export function buildAimChatJsonResponse(chatRun: {
  output: string
  metadata: { runId: string; degraded: boolean; provider: string; model: string }
}) {
  return NextResponse.json({
    content: chatRun.output,
    runId: chatRun.metadata.runId,
    degraded: chatRun.metadata.degraded,
    provider: chatRun.metadata.provider,
    model: chatRun.metadata.model,
  })
}
