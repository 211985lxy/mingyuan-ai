/**
 * Background task executor for remote draft-generation invocations.
 *
 * Task kind: agent.remote.generate
 *
 * Safety guarantees (per AIM Remote Invocation plan):
 * - maxAttempts=1: this executor never retries the model on its own. A lease
 *   expiry after partial work is marked EXECUTION_UNKNOWN / failed for human
 *   adjudication — it must NOT silently re-invoke the model (avoids duplicate
 *   token spend).
 * - Before executing, re-validates the owning key is still active. If the key
 *   was disabled after the task was queued, the invocation is failed without
 *   calling the model.
 * - The model itself runs through executeAimRun (the AIM Harness — the sole
 *   execution runtime), which keeps its internal provider fallback chain.
 *   We do NOT duplicate prompt/model-routing logic here.
 */

import { claimBackgroundTask, completeBackgroundTask, failBackgroundTask } from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { executeAimRun, normalizeAimAgentId } from "@/lib/aim-harness/runtime"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { resolveLlmQuality } from "@/lib/aim-harness/llm-quality-policy"
import { createAimTrace } from "@/lib/aim-observability"
import { extractInvocationResults } from "@/lib/aim-remote/invocation-service"
import { REMOTE_ERROR_CODE } from "@/lib/aim-remote/contracts"
import type { ContentFormat } from "@/lib/aim-generator"

export const AGENT_REMOTE_GENERATE_TASK_KIND = "agent.remote.generate"

/**
 * @description 执行remorteinvocationbackgroundtask
 * @param taskId - 任务 ID
 * @returns 无返回值
 */
export async function executeRemoteInvocationBackgroundTask(taskId: string) {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  const invocationId = task.aggregateId

  try {
    // ── Load the invocation envelope ──
    const invocation = await prisma.agentInvocation.findUnique({
      where: { id: invocationId },
      include: { apiKey: { select: { id: true, status: true } } },
    })
    if (!invocation) {
      await completeBackgroundTask(prisma, task.id, task.leaseToken!)
      return true
    }

    // ── Re-validate the owning key before spending tokens ──
    // If the key was disabled/revoked after enqueue, fail without calling the model.
    if (invocation.apiKey.status !== "active") {
      await failInvocation(invocationId, REMOTE_ERROR_CODE.KEY_DISABLED, "API key was disabled before execution")
      await failBackgroundTask(prisma, {
        taskId: task.id,
        leaseToken: task.leaseToken!,
        attempt: task.attempt,
        maxAttempts: task.maxAttempts,
        retryable: false,
        error: "API key disabled before execution",
      })
      return true
    }

    // ── Mark running ──
    await prisma.agentInvocation.update({
      where: { id: invocationId },
      data: { status: "running", startedAt: new Date() },
    })

    const trace = await createAimTrace({
      userId: invocation.userId,
      projectId: invocation.projectId,
      agentId: invocation.agentId,
      action: "generate",
      inputSummary: invocation.rawInput.slice(0, 500),
    })

    const normalizedAgentId = normalizeAimAgentId(invocation.agentId)
    const targetFormats = (invocation.targetFormats as ContentFormat[]) ?? []

    // ── Execute via the AIM Harness (sole runtime) ──
    const run = await executeAimRun(
      {
        entrypoint: "agent_api",
        agentId: normalizedAgentId,
        rawInput: invocation.rawInput,
        targetFormats,
        polishInstruction: invocation.instruction ?? undefined,
        actorId: invocation.userId,
        projectId: invocation.projectId,
        runLlmQuality: resolveLlmQuality("agent_api").run,
        ...(trace ? { trace: { id: trace.id } } : {}),
      },
      (spec) =>
        executeAimGenerationDomain(spec, {
          userId: invocation.userId,
          projectId: invocation.projectId,
          rawInput: invocation.rawInput,
          targetFormats,
          polishInstruction: invocation.instruction ?? undefined,
          trace: trace ?? undefined,
        }),
    )

    const generationId = run.generationId
    const results = generationId
      ? await loadInvocationResults(generationId)
      : []

    // ── Persist success ──
    await prisma.agentInvocation.update({
      where: { id: invocationId },
      data: {
        status: "succeeded",
        runId: run.metadata.runId,
        aimGenerationId: generationId ?? null,
        provider: run.metadata.provider,
        model: run.metadata.model,
        degraded: run.metadata.degraded,
        inputTokens: run.metadata.providerAttempts.at(-1)?.promptTokens ?? null,
        outputTokens: run.metadata.providerAttempts.at(-1)?.completionTokens ?? null,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    })

    // Stash the results snapshot for the GET endpoint (best-effort).
    if (results.length > 0) {
      // Results are derived from AimGeneration columns; the GET endpoint reads
      // them directly via extractInvocationResults when needed. No extra write.
    }

    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // maxAttempts=1: never auto-retry. Mark failed (or EXECUTION_UNKNOWN for
    // ambiguous partial failures) for human adjudication.
    const errorCode = inferErrorCode(message)
    await failInvocation(invocationId, errorCode, message)
    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable: false,
      error: message,
    })
    return true
  }
}

/** Load the per-format outputs from the generated AimGeneration record. */
async function loadInvocationResults(generationId: string) {
  const gen = await prisma.aimGeneration.findUnique({
    where: { id: generationId },
    select: {
      videoScript: true,
      wechatArticle: true,
      momentsPost: true,
      communityMessage: true,
      shootingBrief: true,
      rawCopy: true,
    },
  })
  if (!gen) return []
  return extractInvocationResults(gen)
}

/** Mark an invocation failed with a structured error code. */
async function failInvocation(invocationId: string, errorCode: string, errorMessage: string) {
  await prisma.agentInvocation.update({
    where: { id: invocationId },
    data: {
      status: "failed",
      errorCode,
      errorMessage: errorMessage.slice(0, 2000),
      completedAt: new Date(),
    },
  })
}

/** Infer a structured error code from a raw error message (best-effort). */
function inferErrorCode(message: string): string {
  if (/quota|额度|余额|充值/i.test(message)) return REMOTE_ERROR_CODE.DAILY_TOKEN_EXCEEDED
  if (/timeout|timed out|超时/i.test(message)) return REMOTE_ERROR_CODE.EXECUTION_UNKNOWN
  return REMOTE_ERROR_CODE.EXECUTION_UNKNOWN
}
