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
  /** 已完成/失败任务对应的 Harness 编号与 Trace 编号，重放时保持可观测性一致。 */
  runId?: string
  traceId?: string
}

function cleanDbText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[\u{10000}-\u{10FFFF}]/gu, "")
}

function attemptWhere(id: string, userId: string, projectId?: string | null) {
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
  /** 用户点击“再试一次”时，允许原任务从 failed/stale 原子回到 running。 */
  allowRetry?: boolean
}) {
  const rawInput = cleanDbText(input.rawInput)
  const agentId = normalizeAimAgentId(input.agentId)
  const projectId = input.projectId || null
  const id = input.attemptId && WEB_ATTEMPT_ID.test(input.attemptId) ? input.attemptId : undefined
  if (id) {
    const existing = await prisma.aimGeneration.findUnique({
      where: { id },
      select: attemptSelect,
    })
    if (existing) {
      return replayExistingAttempt(
        id,
        input.userId,
        projectId,
        agentId,
        rawInput,
        input.targetFormats,
        existing,
        Boolean(input.allowRetry),
      )
    }
  }

  try {
    const created = await prisma.aimGeneration.create({
      data: {
        ...(id ? { id } : {}),
        userId: input.userId,
        projectId,
        agentId,
        rawInput,
        formatsRequested: input.targetFormats,
        // 创建即 running，避免 create 与“领取执行”之间出现 pending 竞态窗口。
        status: "running",
        workflowStatus: "draft",
        taskSpec: { execution: { phase: "running", source: "execute" } },
      },
      select: { id: true },
    })
    return { id: created.id, created: true as const, replay: "continue" as const }
  } catch (error) {
    // 并发首次请求可能由另一个请求先创建同一 attemptId；重新读取后走统一终态协议。
    if (!id || !isPrismaUniqueConstraint(error)) throw error
    const existing = await prisma.aimGeneration.findUnique({ where: { id }, select: attemptSelect })
    if (!existing) throw error
    return replayExistingAttempt(
      id,
      input.userId,
      projectId,
      agentId,
      rawInput,
      input.targetFormats,
      existing,
      Boolean(input.allowRetry),
    )
  }
}

export async function markAimGenerationRunning(input: {
  id: string
  userId: string
  projectId?: string
}) {
  await prisma.aimGeneration.updateMany({
    where: {
      ...attemptWhere(input.id, input.userId, input.projectId),
      status: { in: ["pending", "awaiting_input"] },
    },
    data: { status: "running", errorMessage: null },
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

/** 关闭一个已持久化但本轮只产生对话回复的澄清任务，避免 awaiting/running 永久悬挂。 */
export async function completeAimGenerationAttempt(input: {
  id: string
  userId: string
  projectId?: string
}) {
  await prisma.aimGeneration.updateMany({
    where: {
      ...attemptWhere(input.id, input.userId, input.projectId),
      status: { in: ["running", "awaiting_input"] },
    },
    data: { status: "completed", errorMessage: null },
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
    where: {
      ...attemptWhere(input.id, input.userId, input.projectId),
      // 迟到的超时/断开回调不得把已完成的任务重新标失败。
      status: { in: ["pending", "running", "awaiting_input"] },
    },
    data: { status: "failed", errorMessage: cleanDbText(errorMessage).slice(0, 2000) },
  })
}

export async function sweepStaleAimGenerations(now = new Date()) {
  const delegate = (prisma as typeof prisma & {
    aimGeneration?: {
      updateMany(args: unknown): Promise<{ count: number }>
    }
  }).aimGeneration
  // 兼容尚未完成数据库迁移的实例与旧版测试 mock：清理不可用时不应阻断其它后台任务。
  if (!delegate?.updateMany) return 0
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS)
  try {
    const result = await delegate.updateMany({
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
  } catch (error) {
    // 清理是后台保洁，不得因为旧实例尚未迁移或数据库短暂不可用而
    // 阻断同一入口下其它后台任务。
    console.warn("[aim-generation] stale sweep skipped", error)
    return 0
  }
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
        ...(started.runId ? { runId: started.runId } : {}),
        ...(started.traceId ? { traceId: started.traceId } : {}),
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
      ...(started.runId ? { runId: started.runId } : {}),
      ...(started.traceId ? { traceId: started.traceId } : {}),
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

const attemptSelect = {
  userId: true,
  projectId: true,
  agentId: true,
  rawInput: true,
  formatsRequested: true,
  status: true,
  errorMessage: true,
  videoScript: true,
  wechatArticle: true,
  momentsPost: true,
  communityMessage: true,
  shootingBrief: true,
  rawCopy: true,
  knowledgeUsed: true,
} as const

async function loadAttemptTrace(input: {
  generationId: string
  userId: string
  projectId: string | null
}): Promise<{ runId?: string; traceId?: string }> {
  // 部分单测/旧部署尚未暴露 delegate；重放不能因可观测查询失败而阻断交付。
  const delegate = (prisma as typeof prisma & {
    aimExecutionTrace?: {
      findFirst(args: unknown): Promise<{ id: string; runId: string | null } | null>
    }
  }).aimExecutionTrace
  if (!delegate?.findFirst) return {}
  try {
    const trace = await delegate.findFirst({
      where: { aimGenerationId: input.generationId, userId: input.userId, projectId: input.projectId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, runId: true },
    })
    return {
      ...(trace?.runId ? { runId: trace.runId } : {}),
      ...(trace?.id ? { traceId: trace.id } : {}),
    }
  } catch {
    return {}
  }
}

function isPrismaUniqueConstraint(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && (error as { code?: unknown }).code === "P2002"
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

async function replayExistingAttempt(
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
  allowRetry = false,
): Promise<AimGenerationAttemptStart> {
  if (
    existing.userId !== userId
    || existing.projectId !== projectId
    || (existing.agentId ?? "") !== agentId
    || !sameFormats(existing.formatsRequested, targetFormats)
  ) {
    throw new AimGenerationAttemptError("INVALID_REQUEST", "生成任务标识与当前请求不一致", id)
  }
  // 回答澄清时允许 currentUserRequest 变成补充内容；任务身份仍由账号/项目/Agent/格式校验保护。
  if (existing.status !== "awaiting_input" && existing.rawInput !== rawInput) {
    throw new AimGenerationAttemptError("INVALID_REQUEST", "生成任务标识与当前请求不一致", id)
  }

  if (existing.status === "pending" || existing.status === "awaiting_input") {
    const claimed = await prisma.aimGeneration.updateMany({
      where: { ...attemptWhere(id, userId, projectId), status: existing.status },
      data: { status: "running", errorMessage: null },
    })
    if (claimed.count === 1) return { id, created: false, replay: "continue" }
    const current = await prisma.aimGeneration.findUnique({ where: { id }, select: attemptSelect })
    if (current) {
      return replayExistingAttempt(id, userId, projectId, agentId, rawInput, targetFormats, current, allowRetry)
    }
    throw new AimGenerationAttemptError("GENERATION_IN_PROGRESS", "同一生成任务仍在执行中", id)
  }
  if (existing.status === "running") {
    throw new AimGenerationAttemptError("GENERATION_IN_PROGRESS", "同一生成任务仍在执行中", id)
  }
  if (allowRetry && existing.status === "failed") {
    const claimed = await prisma.aimGeneration.updateMany({
      where: { ...attemptWhere(id, userId, projectId), status: "failed" },
      data: { status: "running", errorMessage: null },
    })
    if (claimed.count === 1) return { id, created: false, replay: "continue" }
    const current = await prisma.aimGeneration.findUnique({ where: { id }, select: attemptSelect })
    if (current) {
      return replayExistingAttempt(id, userId, projectId, agentId, rawInput, targetFormats, current, false)
    }
    throw new AimGenerationAttemptError("GENERATION_IN_PROGRESS", "同一生成任务仍在执行中", id)
  }
  if (existing.status === "completed" || existing.status === "degraded") {
    const trace = await loadAttemptTrace({ generationId: id, userId, projectId })
    return {
      id,
      created: false,
      replay: "completed",
      results: resultsFromGeneration(existing),
      knowledgeUsed: Array.isArray(existing.knowledgeUsed) ? existing.knowledgeUsed : [],
      ...trace,
    }
  }
  const trace = await loadAttemptTrace({ generationId: id, userId, projectId })
  return { id, created: false, replay: "failed", ...parseStoredAttemptFailure(existing.errorMessage), ...trace }
}
