/**
 * AIM Thin Harness v1 — the runner.
 *
 * runAimHarness():
 *   1. plan the run once (immutable AimRunSpec)
 *   2. register the LLM telemetry callback to capture provider attempts
 *   3. execute the domain executor (a caller-supplied function that drives the
 *      existing handlers — buildAimGeneration / buildAimChatResponse — unchanged)
 *   4. assemble AimRunMetadata (runId, actual provider/model, fallbackIndex,
 *      degraded, promptHash, contextHash, providerAttempts)
 *
 * The runner does NOT reimplement prompt assembly or context loading. The
 * executor closure is supplied by the entrypoint adapter so the same runner
 * works for generate, chat, agent_api and inspiration. Quality gating, snapshot
 * persistence and trace stamping are layered on top (see quality.ts / snapshot.ts).
 */

import { randomUUID } from "node:crypto"

import type { LlmInvocation, ProviderAttempt } from "@/lib/llm/telemetry"
import { runWithLlmTelemetry } from "@/lib/llm/telemetry"

import { hashContextManifest, hashPrompt } from "./hashing"
import { planAimRun } from "./planner"
import type { PlanRunInput } from "./planner"
import type {
  AimContextSource,
  AimRunMetadata,
  AimRunSpec,
} from "./types"
import { HARNESS_VERSION } from "./types"

export interface RunAimHarnessInput {
  plan: PlanRunInput
  /**
   * The domain executor. Drives the existing handler (buildAimGeneration /
   * buildAimChatResponse) and returns its raw result plus the context manifest
   * and composed prompt the adapter observed. The runner supplies the resolved
   * AimRunSpec (e.g. runtimeTask) so the executor can pass it through and avoid
   * re-resolution inside the handler.
   */
  execute: (spec: AimRunSpec) => Promise<RunAimExecutionResult>
  /** optional trace id to stamp metadata onto (long-term fields) */
  traceId?: string
}

export interface RunAimExecutionResult {
  output: unknown
  /** context sources the executor loaded (knowledge, ip wiki, …) */
  contextManifest?: AimContextSource[]
  /** the final composed prompt text (best-effort; used for promptHash + snapshot) */
  composedPrompt?: string
}

/** Build a stable runId (the external execution number). */
function makeRunId(): string {
  // Prefix + uuid; kept under the VarChar(40) column.
  const uuid = randomUUID().replace(/-/g, "").slice(0, 28)
  return `run_${uuid}`
}

export interface AimHarnessOutcome {
  spec: AimRunSpec
  metadata: AimRunMetadata
  output: unknown
  contextManifest: AimContextSource[]
  composedPrompt: string
  promptMessages: LlmInvocation["messages"][]
  imageHashes: LlmInvocation["imageHashes"]
  runId: string
}

/**
 * Execute a normalized AIM run through the domain executor, capturing full run
 * metadata. Never silently switches models on non-retryable errors — that is
 * enforced inside LLMClient via the telemetry classifier.
 */
export async function runAimHarness(
  input: RunAimHarnessInput
): Promise<AimHarnessOutcome> {
  const spec = planAimRun(input.plan)
  const runId = makeRunId()

  // Capture every provider attempt for this run via the LLM telemetry seam.
  const providerAttempts: ProviderAttempt[] = []
  const invocations: LlmInvocation[] = []
  const execution = await runWithLlmTelemetry(
    {
      onAttempt: (attempt) => providerAttempts.push(attempt),
      onInvocation: (invocation) => invocations.push(invocation),
    },
    () => input.execute(spec),
  )

  const contextManifest = execution.contextManifest ?? []
  const composedPrompt = invocations.length > 0
    ? invocations.map((invocation, index) =>
        `=== LLM INVOCATION ${index + 1} ===\n${invocation.fullPrompt}`
      ).join("\n\n")
    : execution.composedPrompt ?? spec.rawInput
  const promptMessages = invocations.map((invocation) => invocation.messages)
  const imageHashes = invocations.flatMap((invocation) => invocation.imageHashes)

  // Derive metadata from the observed attempts.
  const successfulAttempt =
    [...providerAttempts].reverse().find((attempt) => attempt.status === "success") ??
    providerAttempts[providerAttempts.length - 1]

  const failedAttempts = providerAttempts.filter((attempt) => attempt.status === "failed")
  const fallbackIndex = successfulAttempt?.attemptIndex ?? 0
  const degraded = failedAttempts.length > 0 && successfulAttempt !== undefined

  const metadata: AimRunMetadata = {
    runId,
    harnessVersion: HARNESS_VERSION,
    provider: successfulAttempt?.provider ?? "unknown",
    model: successfulAttempt?.responseModel ?? successfulAttempt?.model ?? "unknown",
    fallbackIndex,
    degraded,
    promptHash: hashPrompt(composedPrompt),
    contextHash: hashContextManifest(contextManifest),
    providerAttempts: providerAttempts.map((attempt) => ({
      provider: attempt.provider,
      model: attempt.model,
      status: attempt.status,
      error: attempt.error,
      errorKind: attempt.errorKind,
      durationMs: attempt.durationMs,
      attemptIndex: attempt.attemptIndex,
      responseModel: attempt.responseModel,
      totalTokens: attempt.totalTokens,
    })),
  }

  return {
    spec,
    metadata,
    output: execution.output,
    contextManifest,
    composedPrompt,
    promptMessages,
    imageHashes,
    runId,
  }
}
