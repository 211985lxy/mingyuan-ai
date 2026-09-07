import { prisma } from "@/lib/prisma"
import { normalizeAimAgentId } from "@/lib/aim-harness/contracts"
import {
  aimFailureHttpStatus,
  classifyAimFailure,
  mapAimFailureCodeToUserMessage,
  type AimFailureCode,
} from "@/lib/aim-error-message"

const WEB_ATTEMPT_ID = /^web_[a-f0-9]{24}$/
const STALE_AFTER_MS = 10 * 60 * 1000
const CONTENT_COLUMNS = [
  ["videoScript", "video_script"],
  ["wechatArticle", "wechat_article"],
  ["momentsPost", "moments_post"],
  ["communityMessage", "community_message"],
  ["shootingBrief", "shooting_brief"],
  ["rawCopy", "raw_copy"],
] as const

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

export type AimGenerationReplayResult = {
  format: string
  content: string
  wordCount: number
}

export type AimGenerationAttemptStart = {
  id: string
  created: boolean
  replay: AimGenerationReplay
  results?: AimGenerationReplayResult[]
  knowledgeUsed?: unknown
  errorCode?: AimFailureCode
  errorMessage?: string
}

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
        videoScript: true, wechatArticle: true, momentsPost: true,
        communityMessage: true, shootingBrief: true, rawCopy: true,
        knowledgeUsed: true,
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
  const code = input.code || classifyAimFailure(input.error)
  const errorMessage = `${code}: ${mapAimFailureCodeToUserMessage(code)}`
  await prisma.aimGeneration.updateMany({
    where: attemptWhere(input.id, input.userId, input.projectId),
    data: { status: "failed", errorMessage: cleanDbText(errorMessage).slice(0, 2000) },
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

export function buildAimAttemptReplayResponse(started: AimGenerationAttemptStart) {
  if (started.replay === "completed") {
    return {
      status: 200,
      body: {
        kind: "deliverable" as const,
        id: started.id,
        generationId: started.id,
        results: started.results ?? [],
        knowledgeUsed: started.knowledgeUsed ?? [],
      },
    }
  }
  if (started.replay !== "failed") return null
  const code = started.errorCode ?? "INTERNAL_ERROR"
  return {
    status: aimFailureHttpStatus(code),
    body: {
      error: started.errorMessage || mapAimFailureCodeToUserMessage(code),
      code,
      generationId: started.id,
    },
  }
}

function resultsFromGeneration(existing: Record<string, unknown>): AimGenerationReplayResult[] {
  return CONTENT_COLUMNS.flatMap(([column, format]) => {
    const content = existing[column]
    if (typeof content !== "string" || !content) return []
    return [{ format, content, wordCount: content.length }]
  })
}

function parseStoredAttemptFailure(errorMessage: string | null): {
  errorCode: AimFailureCode
  errorMessage: string
} {
  const raw = errorMessage?.trim() || "生成失败"
  const matched = raw.match(/^([A-Z][A-Z0-9_]+):\s*([\s\S]*)$/)
  if (matched) {
    const errorCode = classifyAimFailure({ code: matched[1] })
    return {
      errorCode: matched[1] === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : errorCode,
      errorMessage: matched[2] || mapAimFailureCodeToUserMessage(errorCode),
    }
  }
  return { errorCode: classifyAimFailure(new Error(raw)), errorMessage: raw }
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
    videoScript?: string | null
    wechatArticle?: string | null
    momentsPost?: string | null
    communityMessage?: string | null
    shootingBrief?: string | null
    rawCopy?: string | null
    knowledgeUsed?: unknown
  },
): AimGenerationAttemptStart {
  if (
    existing.userId !== userId
    || existing.projectId !== projectId
    || (existing.agentId ?? "") !== agentId
    || !sameFormats(existing.formatsRequested, targetFormats)
  ) {
    throw new AimGenerationAttemptError("INVALID_REQUEST", "生成任务标识与当前请求不一致", id)
  }
  if (existing.status === "awaiting_input") {
    return { id, created: false, replay: "continue" }
  }
  if (existing.rawInput !== rawInput) {
    throw new AimGenerationAttemptError("INVALID_REQUEST", "生成任务标识与当前请求不一致", id)
  }
  if (existing.status === "running") {
    throw new AimGenerationAttemptError("GENERATION_IN_PROGRESS", "同一生成任务仍在执行中", id)
  }
  if (existing.status === "pending") {
    return { id, created: false, replay: "continue" }
  }
  if (existing.status === "completed" || existing.status === "degraded") {
    return {
      id,
      created: false,
      replay: "completed",
      results: resultsFromGeneration(existing),
      knowledgeUsed: Array.isArray(existing.knowledgeUsed) ? existing.knowledgeUsed : [],
    }
  }
  return { id, created: false, replay: "failed", ...parseStoredAttemptFailure(existing.errorMessage) }
}
