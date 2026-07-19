import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

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

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
}

/**
 * 以调用方提供的确定性主键原子领取一次运行。delegate 缺失或基础设施错误时抛出，
 * 由生产工作流 fail-closed；只有数据库唯一冲突会被识别为重复执行。
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
 * 释放尚未进入模型工作流的原子 claim。
 * 仅删除 running 记录；调用方必须保证该 Trace 尚未交给 executeAimRun。
 */
export async function releaseAimTraceClaim(trace: AimTraceRecorder | undefined): Promise<void> {
  if (!trace) return
  const delegate = getTraceDelegate()
  if (!delegate?.deleteMany) throw new Error("AimExecutionTrace deleteMany unavailable")
  const result = await delegate.deleteMany({ where: { id: trace.id, status: "running" } })
  if (result.count !== 1) throw new Error(`Trace claim 无法安全释放：${trace.id}`)
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

export async function finishAimTrace(trace: AimTraceRecorder | undefined, update: TraceUpdate = {}) {
  if (!trace) return
  await safeUpdateTrace(trace.id, {
    ...update,
    status: update.status || "success",
    durationMs: Date.now() - trace.startedAt,
  })
}

export async function failAimTrace(trace: AimTraceRecorder | undefined, error: unknown) {
  if (!trace) return
  const message = error instanceof Error ? error.message : String(error)
  await safeUpdateTrace(trace.id, {
    status: "failed",
    durationMs: Date.now() - trace.startedAt,
    errorMessage: summarizeText(message),
  })
}
