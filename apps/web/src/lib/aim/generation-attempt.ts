import { prisma } from "@/lib/prisma"
import { normalizeAimAgentId } from "@/lib/aim-harness/contracts"

const WEB_ATTEMPT_ID = /^web_[a-f0-9]{24}$/
const STALE_AFTER_MS = 10 * 60 * 1000

export type AimGenerationAttemptCode =
  | "INVALID_REQUEST"
  | "GENERATION_IN_PROGRESS"
  | "STALE_EXECUTION"

export class AimGenerationAttemptError extends Error {
  readonly code: AimGenerationAttemptCode
  readonly generationId?: string

  constructor(code: AimGenerationAttemptCode, message: string, generationId?: string) {
    super(message)
    this.name = "AimGenerationAttemptError"
    this.code = code
    this.generationId = generationId
  }
}

export type AimGenerationReplay = "continue" | "completed" | "failed" | "awaiting_input"

function cleanDbText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[\u{10000}-\u{10FFFF}]/gu, "")
}

function attemptWhere(id: string, userId: string, projectId?: string) {
  return { id, userId, projectId: projectId || null }
}

function sameFormats(value: unknown, expected: string[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index])
}

export async function startAimGenerationAttempt(input: {
  attemptId?: string
  userId: string
  projectId?: string
  agentId: string
  rawInput: string
  targetFormats: string[]
}) {
  const rawInput = cleanDbText(input.rawInput)
  const agentId = normalizeAimAgentId(input.agentId)
  const projectId = input.projectId || null
  const id = input.attemptId && WEB_ATTEMPT_ID.test(input.attemptId) ? input.attemptId : undefined
  if (id) {
    const existing = await prisma.aimGeneration.findUnique({
      where: { id },
      select: {
        userId: true, projectId: true, agentId: true, rawInput: true,
        formatsRequested: true, status: true, errorMessage: true,
      },
    })
    if (existing) return replayExistingAttempt(id, input.userId, projectId, agentId, rawInput, input.targetFormats, existing)
  }

  const created = await prisma.aimGeneration.create({
    data: {
      ...(id ? { id } : {}),
      userId: input.userId,
      projectId,
      agentId,
      rawInput,
      formatsRequested: input.targetFormats,
      status: "pending",
      workflowStatus: "draft",
      taskSpec: { execution: { phase: "pending", source: "execute" } },
    },
    select: { id: true },
  })
  return { id: created.id, created: true as const, replay: "continue" as const }
}

export async function markAimGenerationRunning(input: {
  id: string
  userId: string
  projectId?: string
}) {
  await prisma.aimGeneration.updateMany({
    where: attemptWhere(input.id, input.userId, input.projectId),
    data: { status: "running" },
  })
}

export async function markAimGenerationAwaitingInput(input: {
  id: string
  userId: string
  projectId?: string
}) {
  await prisma.aimGeneration.updateMany({
    where: attemptWhere(input.id, input.userId, input.projectId),
    data: { status: "awaiting_input" },
  })
}

export async function discardAimGenerationAttempt(input: {
  id: string
  userId: string
  projectId?: string
  created: boolean
}) {
  if (!input.created) return
  await prisma.aimGeneration.deleteMany({
    where: {
      ...attemptWhere(input.id, input.userId, input.projectId),
      status: { in: ["pending", "running"] },
    },
  })
}

export async function failAimGenerationAttempt(input: {
  id: string
  userId: string
  projectId?: string
  error: unknown
  code?: string
}) {
  const errorMessage = cleanDbText(input.error instanceof Error ? input.error.message : "生成失败").slice(0, 2000)
  await prisma.aimGeneration.updateMany({
    where: attemptWhere(input.id, input.userId, input.projectId),
    data: { status: "failed", errorMessage },
  })
}

export async function sweepStaleAimGenerations(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS)
  const result = await prisma.aimGeneration.updateMany({
    where: {
      status: { in: ["pending", "running"] },
      updatedAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      errorMessage: "STALE_EXECUTION: 任务超时未完成，已停止继续消耗。素材和要求已保留。",
    },
  })
  return result.count
}

function replayExistingAttempt(
  id: string,
  userId: string,
  projectId: string | null,
  agentId: string,
  rawInput: string,
  targetFormats: string[],
  existing: {
    userId: string
    projectId: string | null
    agentId: string | null
    rawInput: string
    formatsRequested: unknown
    status: string
    errorMessage: string | null
  },
) {
  if (
    existing.userId !== userId
    || existing.projectId !== projectId
    || (existing.agentId ?? "") !== agentId
    || !sameFormats(existing.formatsRequested, targetFormats)
  ) {
    throw new AimGenerationAttemptError("INVALID_REQUEST", "生成任务标识与当前请求不一致", id)
  }
  if (existing.status === "awaiting_input") {
    return { id, created: false as const, replay: "continue" as const }
  }
  if (existing.rawInput !== rawInput) {
    throw new AimGenerationAttemptError("INVALID_REQUEST", "生成任务标识与当前请求不一致", id)
  }
  if (existing.status === "running") {
    throw new AimGenerationAttemptError("GENERATION_IN_PROGRESS", "同一生成任务仍在执行中", id)
  }
  if (existing.status === "pending") {
    return { id, created: false as const, replay: "continue" as const }
  }
  if (existing.status === "completed" || existing.status === "degraded") {
    return { id, created: false as const, replay: "completed" as const }
  }
  return {
    id,
    created: false as const,
    replay: "failed" as const,
    errorMessage: existing.errorMessage ?? "生成失败",
  }
}
