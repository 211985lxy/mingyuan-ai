/**
 * Shared domain service for remote draft-generation invocations.
 *
 * Both the REST routes (/api/agent/v1/invocations) and the MCP tools
 * (aim_draft_submit / aim_invocation_get) call into these functions so that
 * the submission, idempotency, and read logic lives in exactly one place.
 *
 * The service never executes the model itself — it only creates the
 * AgentInvocation envelope and enqueues a single-attempt background task.
 * The actual generation happens in remote-invocation-task.ts via the AIM
 * Harness (the sole execution runtime).
 */

import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import type { AgentApiContext } from "@/lib/agent-api-auth"
import { assertAgentProjectAccess, assertAgentAccess } from "@/lib/agent-api-auth"
import { checkMinuteQuota, assertDailyTokenBudget } from "@/lib/agent-token-quota"
import {
  AGENT_REMOTE_GENERATE_TASK_KIND,
  DEFAULT_POLL_AFTER_SECONDS,
  MAX_INSTRUCTION_CHARS,
  MAX_RAW_INPUT_CHARS,
  MAX_TARGET_FORMATS,
  MIN_TARGET_FORMATS,
  REMOTE_ERROR_CODE,
  type AgentInvocationResponse,
  type InvocationResultItem,
  type RemoteInvocationStatus,
  type SubmitAgentInvocationInput,
} from "./contracts"
import type { ContentFormat } from "@/lib/aim-generator"
import { splitGenerationReasoning } from "@/lib/aim-generation-text"

const ACTION = "draft.generate"

/** Compute a stable hash of the request payload for idempotency conflict detection. */
export function computeRequestHash(input: SubmitAgentInvocationInput): string {
  const payload = JSON.stringify({
    projectId: input.projectId,
    agentId: input.agentId,
    rawInput: input.rawInput,
    targetFormats: [...input.targetFormats].sort(),
    instruction: input.instruction ?? "",
    topicTitle: input.topicTitle ?? "",
    topicRationale: input.topicRationale ?? "",
  })
  return createHash("sha256").update(payload).digest("hex")
}

export type SubmitResult =
  | { ok: true; response: AgentInvocationResponse; created: boolean }
  | { ok: false; errorCode: typeof REMOTE_ERROR_CODE[keyof typeof REMOTE_ERROR_CODE]; errorMessage: string }

/**
 * Submit (or idempotently return) a draft-generation invocation.
 *
 * Idempotency rules keyed on (apiKeyId, action, idempotencyKey):
 * - Same requestHash → return the existing invocation (no new task, no token spend).
 * - Different requestHash → IDEMPOTENCY_CONFLICT (409).
 * - Still active (queued/running) → return current status.
 *
 * On a genuine new submission, creates the AgentInvocation and enqueues a
 * single-attempt background task in the same transaction.
 */
export async function submitInvocation(
  context: AgentApiContext,
  input: SubmitAgentInvocationInput,
): Promise<SubmitResult> {
  // ── Validate input bounds ──
  if (input.rawInput.length > Math.min(context.maxInputChars, MAX_RAW_INPUT_CHARS)) {
    return { ok: false, errorCode: REMOTE_ERROR_CODE.INPUT_TOO_LARGE, errorMessage: "rawInput 超过允许长度" }
  }
  if (input.targetFormats.length < MIN_TARGET_FORMATS || input.targetFormats.length > MAX_TARGET_FORMATS) {
    return { ok: false, errorCode: REMOTE_ERROR_CODE.TOO_MANY_FORMATS, errorMessage: "targetFormats 必须为 1-3 种" }
  }
  if (input.instruction && input.instruction.length > MAX_INSTRUCTION_CHARS) {
    return { ok: false, errorCode: REMOTE_ERROR_CODE.INPUT_TOO_LARGE, errorMessage: "instruction 超过允许长度" }
  }

  // ── Project + agent scope (existing assertions) ──
  await assertAgentProjectAccess(context, input.projectId)
  assertAgentAccess(context, input.agentId)

  // ── Quota: per-minute requests + daily token budget ──
  const minuteCheck = await checkMinuteQuota(context.apiKeyId, context.minuteLimit)
  if (!minuteCheck.allowed) {
    return { ok: false, errorCode: REMOTE_ERROR_CODE.MINUTE_LIMIT_EXCEEDED, errorMessage: "请求过于频繁，请稍后再试" }
  }
  try {
    await assertDailyTokenBudget(context.apiKeyId, context.dailyTokenLimit)
  } catch (quotaError) {
    const code = quotaError instanceof Error ? quotaError.message : REMOTE_ERROR_CODE.DAILY_TOKEN_EXCEEDED
    return { ok: false, errorCode: code as typeof REMOTE_ERROR_CODE.DAILY_TOKEN_EXCEEDED, errorMessage: "每日 Token 预算已用尽" }
  }

  const requestHash = computeRequestHash(input)

  // ── Idempotency: check for an existing invocation with this key ──
  const existing = await prisma.agentInvocation.findUnique({
    where: { apiKeyId_action_idempotencyKey: { apiKeyId: context.apiKeyId, action: ACTION, idempotencyKey: input.idempotencyKey } },
  })
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return { ok: false, errorCode: REMOTE_ERROR_CODE.IDEMPOTENCY_CONFLICT, errorMessage: "相同幂等键但请求内容不同" }
    }
    return { ok: true, response: toInvocationResponse(existing), created: false }
  }

  // ── Create invocation + enqueue single-attempt task atomically ──
  const created = await prisma.$transaction(async (tx) => {
    const invocation = await tx.agentInvocation.create({
      data: {
        apiKeyId: context.apiKeyId,
        userId: context.userId,
        projectId: input.projectId,
        agentId: input.agentId,
        action: ACTION,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        rawInput: input.rawInput,
        targetFormats: input.targetFormats,
        instruction: input.instruction ?? null,
        status: "queued",
      },
    })
    const task = await enqueueBackgroundTask(tx as never, {
      kind: AGENT_REMOTE_GENERATE_TASK_KIND,
      aggregateType: "agent_invocation",
      aggregateId: invocation.id,
      idempotencyKey: `agent-remote-gen:${invocation.id}`,
      // maxAttempts=1: lease expiry must NOT auto-retry the model (avoids duplicate token spend)
      maxAttempts: 1,
    })
    await tx.agentInvocation.update({
      where: { id: invocation.id },
      data: { backgroundTaskId: task.id },
    })
    return invocation
  })

  return { ok: true, response: toInvocationResponse(created), created: true }
}

/**
 * Read a single invocation, enforcing that the requesting key created it.
 * Returns null when not found or not owned (caller maps to 404/403).
 */
export async function getInvocation(
  context: AgentApiContext,
  invocationId: string,
): Promise<AgentInvocationResponse | null> {
  const invocation = await prisma.agentInvocation.findUnique({ where: { id: invocationId } })
  if (!invocation) return null
  // Strict ownership: a key may only read invocations it created.
  if (invocation.apiKeyId !== context.apiKeyId) return null
  return toInvocationResponse(invocation)
}

/** Map an AgentInvocation row into the wire response shape. */
function toInvocationResponse(row: {
  id: string
  status: string
  runId: string | null
  aimGenerationId: string | null
  provider: string | null
  model: string | null
  degraded: boolean
  inputTokens: number | null
  outputTokens: number | null
  costCny: { toString(): string } | null
  errorCode: string | null
  errorMessage: string | null
}): AgentInvocationResponse {
  return {
    invocationId: row.id,
    status: row.status as RemoteInvocationStatus,
    pollAfterSeconds: DEFAULT_POLL_AFTER_SECONDS,
    runId: row.runId ?? undefined,
    generationId: row.aimGenerationId ?? undefined,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    degraded: row.degraded || undefined,
    inputTokens: row.inputTokens ?? undefined,
    outputTokens: row.outputTokens ?? undefined,
    costCny: row.costCny == null ? undefined : Number(row.costCny.toString()),
    errorCode: (row.errorCode ?? undefined) as AgentInvocationResponse["errorCode"],
    errorMessage: row.errorMessage ?? undefined,
    warnings: ["draft_only"],
    requiresHumanReview: true,
  }
}

/**
 * Extract per-format result items from an AimGeneration-like output object.
 * Used by the background task executor when materializing invocation results.
 */
export function extractInvocationResults(output: {
  videoScript?: string | null
  wechatArticle?: string | null
  momentsPost?: string | null
  communityMessage?: string | null
  shootingBrief?: string | null
  rawCopy?: string | null
}): InvocationResultItem[] {
  const pairs: Array<[ContentFormat, string | null | undefined]> = [
    ["video_script", output.videoScript],
    ["wechat_article", output.wechatArticle],
    ["moments_post", output.momentsPost],
    ["community_message", output.communityMessage],
    ["shooting_brief", output.shootingBrief],
    ["raw_copy", output.rawCopy],
  ]
  const items: InvocationResultItem[] = []
  for (const [format, content] of pairs) {
    // 存量列里混存的 METHOD_NOTE 思考依据在出参边界剥离：远程调用方只拿可发布正文
    if (content) items.push({ format, content: splitGenerationReasoning(content).content })
  }
  return items
}
