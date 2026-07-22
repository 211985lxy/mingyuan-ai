import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { redis } from "@/lib/redis"

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
  id?: string
  userId?: string | null
  projectId?: string | null
  agentId?: string | null
  action: "chat" | "generate" | "tool_action"
  inputSummary?: string
}

export interface ClaimAimTraceInput extends CreateAimTraceInput {
  id: string
}

export type ClaimAimTraceResult =
  | { acquired: true; trace: AimTraceRecorder }
  | { acquired: false; reason: "duplicate" }

type TraceUpdate = {
  status?: "running" | "success" | "failed"
  durationMs?: number
  model?: string | null
  totalTokens?: number | null
  outputSummary?: string | null
  errorMessage?: string | null
  aimGenerationId?: string | null
}

const TRACE_CHANNEL_PREFIX = "aim:trace:"

function publishTraceEvent(traceId: string, event: { type: string; step?: AimTraceStep; status?: string }) {
  redis.publish(`${TRACE_CHANNEL_PREFIX}${traceId}`, JSON.stringify(event)).catch(() => {})
}

const MAX_SUMMARY_LENGTH = 500

/**
 * @description 将任意值截断为摘要文本（用于日志和跟踪记录）
 * @param value - 待截断的值（支持字符串或可 JSON 序列化对象）
 * @param limit - 最大字符数，默认 500
 * @returns 截断后的摘要字符串
 */
export function summarizeText(value: unknown, limit = MAX_SUMMARY_LENGTH): string {
  if (value == null) return ""
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return text.replace(/\s+/g, " ").trim().slice(0, limit)
}

function getTraceDelegate() {
  return (prisma as typeof prisma & {
    aimExecutionTrace?: {
      create(args: unknown): Promise<{ id: string }>
      deleteMany(args: unknown): Promise<{ count: number }>
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
  publishTraceEvent(trace.id, { type: "step", step })
}

/**
 * @description 创建 AIM 执行跟踪记录（用于可观测性链路追踪）
 * @param input - 跟踪创建输入（用户 ID、项目 ID、Agent ID、操作类型等）
 * @returns 跟踪记录器，创建失败时返回 undefined
 */
export async function createAimTrace(input: CreateAimTraceInput): Promise<AimTraceRecorder | undefined> {
  const delegate = getTraceDelegate()
  if (!delegate) return undefined
  try {
    const record = await delegate.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
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

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
}

/**
 * @description 原子领取一次 AIM 执行跟踪（用于幂等性控制）
 * @param input - 领取输入（ID、用户 ID、项目 ID、智能体 ID、动作等）
 * @returns 领取结果（是否成功、原因、跟踪信息）
 */
export async function claimAimTrace(input: ClaimAimTraceInput): Promise<ClaimAimTraceResult> {
  const delegate = getTraceDelegate()
  if (!delegate?.create) throw new Error("AimExecutionTrace delegate unavailable")
  try {
    await delegate.create({
      data: {
        id: input.id,
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
    return { acquired: true, trace: { id: input.id, startedAt: Date.now() } }
  } catch (error) {
    if (isUniqueConstraintError(error)) return { acquired: false, reason: "duplicate" }
    throw error
  }
}

/**
 * @description 释放尚未进入模型工作流的原子 claim
 * @param trace - 跟踪记录器
 * @returns 无返回值
 */
export async function releaseAimTraceClaim(trace: AimTraceRecorder | undefined): Promise<void> {
  if (!trace) return
  const delegate = getTraceDelegate()
  if (!delegate?.deleteMany) throw new Error("AimExecutionTrace deleteMany unavailable")
  const result = await delegate.deleteMany({ where: { id: trace.id, status: "running" } })
  if (result.count !== 1) throw new Error(`Trace claim 无法安全释放：${trace.id}`)
}

/**
 * @description 执行跟踪步骤包装器：自动记录步骤的执行时间、状态和结果
 * @param trace - 跟踪记录器
 * @param key - 步骤唯一标识
 * @param label - 步骤显示名称
 * @param fn - 待执行的异步/同步函数
 * @param describe - 可选的结果描述函数，用于提取额外信息
 * @returns 函数执行结果
 */
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

/**
 * @description 手动添加一个跟踪步骤记录
 * @param trace - 跟踪记录器
 * @param step - 步骤信息（不含时间戳，自动填充）
 */
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

/**
 * @description 完成 AIM 执行跟踪，记录最终状态和总耗时
 * @param trace - 跟踪记录器
 * @param update - 可选的更新信息（状态、模型、Token 数、输出摘要等）
 */
export async function finishAimTrace(trace: AimTraceRecorder | undefined, update: TraceUpdate = {}) {
  if (!trace) return
  await safeUpdateTrace(trace.id, {
    ...update,
    status: update.status || "success",
    durationMs: Date.now() - trace.startedAt,
  })
  publishTraceEvent(trace.id, { type: "done", status: "success" })
}

/**
 * @description 标记 AIM 执行跟踪为失败状态，记录错误信息
 * @param trace - 跟踪记录器
 * @param error - 捕获的异常对象
 */
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
