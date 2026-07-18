import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { redis } from "@/lib/redis"

/** SSE 推送 Redis channel 前缀 */
const TRACE_CHANNEL_PREFIX = "aim:trace:"
/** trace 事件缓冲 list 前缀（Pub/Sub 无历史，缓冲供 SSE 订阅端回放） */
const TRACE_EVENTS_KEY_PREFIX = "aim:trace:events:"
/** 缓冲保留时长：覆盖最长生成耗时 + 前端拿到 traceId 再订阅的间隔 */
const TRACE_EVENTS_TTL_SECONDS = 600
/** 单条 trace 的缓冲事件上限，防止异常循环打爆内存 */
const TRACE_EVENTS_MAX = 500

/**
 * 通过 Redis Pub/Sub 发布 trace step，供 SSE 端点推送到前端。fire-and-forget。
 * 同时写入带 TTL 的 list 缓冲：generate 是非流式接口，前端拿到 traceId 时
 * 全部事件往往已发布完毕，订阅端需要先回放缓冲再消费实时事件。
 */
function publishTraceEvent(traceId: string, event: { type: string; step?: AimTraceStep; status?: string }) {
  const payload = JSON.stringify(event)
  redis.publish(`${TRACE_CHANNEL_PREFIX}${traceId}`, payload).catch(() => {
    // Redis Pub/Sub is best-effort; missing events only degrade the UI timeline.
  })
  redis
    .multi()
    .rpush(`${TRACE_EVENTS_KEY_PREFIX}${traceId}`, payload)
    .ltrim(`${TRACE_EVENTS_KEY_PREFIX}${traceId}`, -TRACE_EVENTS_MAX, -1)
    .expire(`${TRACE_EVENTS_KEY_PREFIX}${traceId}`, TRACE_EVENTS_TTL_SECONDS)
    .exec()
    .catch(() => {
      // 缓冲失败只影响回放完整性，不阻断主流程
    })
}

/** 读取某条 trace 已缓冲的事件（JSON 字符串数组，按发布顺序）。供 SSE 端点回放。 */
export async function readBufferedTraceEvents(traceId: string): Promise<string[]> {
  try {
    return await redis.lrange(`${TRACE_EVENTS_KEY_PREFIX}${traceId}`, 0, -1)
  } catch {
    return []
  }
}

export type AimTraceStatus = "running" | "success" | "failed" | "skipped"

export interface AimTraceStep {
  key: string
  label: string
  status: AimTraceStatus
  durationMs?: number
  summary?: string
  inputSummary?: string
  outputSummary?: string
  metadata?: Record<string, unknown>
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface AimTraceRecorder {
  id: string
  startedAt: number
}

interface CreateAimTraceInput {
  userId?: string | null
  projectId?: string | null
  agentId?: string | null
  action: "chat" | "generate" | "tool_action"
  inputSummary?: string
}

type TraceUpdate = {
  status?: "running" | "success" | "failed"
  durationMs?: number
  model?: string | null
  totalTokens?: number | null
  outputSummary?: string | null
  errorMessage?: string | null
  aimGenerationId?: string | null
}

const MAX_SUMMARY_LENGTH = 500

export function summarizeText(value: unknown, limit = MAX_SUMMARY_LENGTH): string {
  if (value == null) return ""
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return text.replace(/\s+/g, " ").trim().slice(0, limit)
}

function getTraceDelegate() {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: {
      create(args: unknown): Promise<{ id: string }>
      update(args: unknown): Promise<unknown>
      findUnique(args: unknown): Promise<{ steps: unknown } | null>
    }
  }).aimExecutionTrace
}

async function safeUpdateTrace(id: string, data: Record<string, unknown>) {
  const delegate = getTraceDelegate()
  if (!delegate) return
  try {
    await delegate.update({ where: { id }, data })
  } catch (error) {
    logger.warn({ error, traceId: id }, "[aim-trace] update failed")
  }
}

async function readSteps(id: string): Promise<AimTraceStep[]> {
  const delegate = getTraceDelegate()
  if (!delegate?.findUnique) return []
  try {
    const record = await delegate.findUnique({ where: { id }, select: { steps: true } })
    return Array.isArray(record?.steps) ? record.steps as unknown as AimTraceStep[] : []
  } catch (error) {
    logger.warn({ error, traceId: id }, "[aim-trace] read steps failed")
    return []
  }
}

async function appendStep(trace: AimTraceRecorder | undefined, step: AimTraceStep) {
  if (!trace) return
  const steps = await readSteps(trace.id)
  steps.push(step)
  await safeUpdateTrace(trace.id, { steps })
  // 推送步骤到前端 SSE
  publishTraceEvent(trace.id, { type: "step", step })
}

export async function createAimTrace(input: CreateAimTraceInput): Promise<AimTraceRecorder | undefined> {
  const delegate = getTraceDelegate()
  if (!delegate) return undefined
  try {
    const record = await delegate.create({
      data: {
        userId: input.userId || null,
        projectId: input.projectId || null,
        agentId: input.agentId || null,
        action: input.action,
        inputSummary: summarizeText(input.inputSummary),
        status: "running",
        steps: [],
      },
      select: { id: true },
    })
    return { id: record.id, startedAt: Date.now() }
  } catch (error) {
    logger.warn({ error }, "[aim-trace] create failed")
    return undefined
  }
}

export async function runAimTraceStep<T>(
  trace: AimTraceRecorder | undefined,
  key: string,
  label: string,
  fn: () => T | Promise<T>,
  describe?: (result: Awaited<T>) => Partial<AimTraceStep>,
): Promise<T> {
  const startedAt = Date.now()
  try {
    const result = await fn()
    await appendStep(trace, {
      key,
      label,
      status: "success",
      durationMs: Date.now() - startedAt,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      ...describe?.(result),
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await appendStep(trace, {
      key,
      label,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: summarizeText(message),
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
    })
    throw error
  }
}

export async function addAimTraceStep(
  trace: AimTraceRecorder | undefined,
  step: Omit<AimTraceStep, "startedAt" | "finishedAt">,
) {
  await appendStep(trace, {
    ...step,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  })
}

export async function finishAimTrace(
  trace: AimTraceRecorder | undefined,
  update: TraceUpdate = {},
  options: { deferDoneEvent?: boolean } = {},
) {
  if (!trace) return
  await safeUpdateTrace(trace.id, {
    ...update,
    status: update.status || "success",
    durationMs: Date.now() - trace.startedAt,
  })
  // deferDoneEvent：调用方（如 generate 路由）还有后续步骤（如 quality_gate）要追加，
  // done 事件推迟到全部步骤完成后由 publishAimTraceDone 发布，保证事件时序正确。
  if (!options.deferDoneEvent) {
    publishTraceEvent(trace.id, { type: "done", status: "success" })
  }
}

/** 发布推迟的 done 事件（与 finishAimTrace 的 deferDoneEvent 配套，由路由层在最后调用）。 */
export function publishAimTraceDone(trace: AimTraceRecorder | undefined, status: "success" | "failed" = "success") {
  if (!trace) return
  publishTraceEvent(trace.id, { type: "done", status })
}

export async function failAimTrace(trace: AimTraceRecorder | undefined, error: unknown) {
  if (!trace) return
  const message = error instanceof Error ? error.message : String(error)
  await safeUpdateTrace(trace.id, {
    status: "failed",
    durationMs: Date.now() - trace.startedAt,
    errorMessage: summarizeText(message),
  })
  publishTraceEvent(trace.id, { type: "done", status: "failed" })
}
