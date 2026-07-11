/**
 * AIM Thin Harness v1 — entrypoint adapters.
 *
 * These wrap the existing domain executors (generateAimContent /
 * buildAimChatResponse) so each AIM call:
 *   - is planned once into an AimRunSpec
 *   - records a runId + real provider/model + fallbackIndex + degraded +
 *     promptHash + contextHash (the acceptance-criteria payload)
 *   - persists an AimRunSnapshot (admin-only, 30-day) and stamps the trace
 *   - runs deterministic validators on every format + an LLM report on the main
 *     draft (read-only; never rewrites — auto-rewrite stays off the main path)
 *
 * The domain executors are passed through UNCHANGED. The harness only adds
 * telemetry, persistence and validation around them.
 */

import type { ContentFormat } from "@/lib/aim-generator"
import type { AimGenerateResponse } from "@/lib/aim-agent-handlers"
import type { AimTraceRecorder } from "@/lib/aim-observability"
import type { ProviderAttempt } from "@/lib/llm/telemetry"
import type { LlmInvocation } from "@/lib/llm/telemetry"
import { wrapLlmTelemetryIterable } from "@/lib/llm/telemetry"
import { prisma } from "@/lib/prisma"
import { runQualityCheck } from "@/lib/quality-gate"

import {
  applyRunMetadataToTrace,
  persistAimRunSnapshot,
  runAimHarness,
  validateFormat,
  deriveQualityStatus,
  type AimContextSource,
  type FormatValidationResult,
} from "./index"
import { sha256 } from "./hashing"
import type { AimRunSpec } from "./types"

/** Formats eligible for the main-draft LLM quality report (matches the route). */
const MAIN_DRAFT_FORMATS = new Set<ContentFormat>([
  "video_script",
  "koubo_script",
  "xiaohongshu_post",
])

export interface AimGenerateHarnessInput {
  /** the executor closure (drives generateAimContent with whatever context the route injected) */
  execute: () => Promise<AimGenerateResponse>
  /** planning input (rawInput = the final, context-enriched input the executor saw) */
  rawInput: string
  agentId: string
  targetFormats: ContentFormat[]
  taskType?: string
  polishInstruction?: string
  topicType?: string
  hotTopic?: string
  entrypoint?: "generate" | "agent_api" | "inspiration"
  trace?: AimTraceRecorder
  userId?: string | null
  projectId?: string | null
  /** knowledge ids actually cited by the result, for the context manifest */
  citedKnowledgeIds?: string[]
  /** whether to run the LLM quality report on the main draft */
  runLlmQuality?: boolean
  /** Eval-only: do not write snapshots/traces. */
  persistSnapshot?: boolean
  /** Frozen or pre-resolved sources used instead of querying live knowledge. */
  contextManifest?: AimContextSource[]
}

export interface AimGenerateHarnessOutput {
  result: AimGenerateResponse
  runId: string
  degraded: boolean
  provider: string
  model: string
  qualityChecks?: Array<FormatValidationResult>
  /** deterministic per-format + main-draft LLM quality summary */
  qualityStatus: "pass" | "warn" | "fail" | "skipped"
  /** the main-draft LLM report (same shape the route already returned), if run */
  qualityReport?: Record<string, unknown>
}

/** Build a context manifest from the cited knowledge + the spec. */
async function buildManifest(
  spec: AimRunSpec,
  citedKnowledgeIds: string[] | undefined,
  provided: AimContextSource[] | undefined,
): Promise<AimContextSource[]> {
  const sources: AimContextSource[] = [...(provided ?? [])]
  if (!sources.some((source) => source.kind === "request")) {
    sources.push({
      kind: "request",
      id: "raw_input",
      charCount: spec.rawInput.length,
      contentHash: sha256(spec.rawInput),
    })
  }
  const knowledgeIds = citedKnowledgeIds?.length ? citedKnowledgeIds : []
  const missingIds = knowledgeIds.filter((id) =>
    !sources.some((source) => source.kind === "knowledge" && source.id === id)
  )
  if (missingIds.length > 0) {
    try {
      const rows = await prisma.knowledgeEntry.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, content: true, updatedAt: true },
      })
      for (const row of rows) {
        sources.push({
          kind: "knowledge",
          id: row.id,
          updatedAt: row.updatedAt.toISOString(),
          charCount: row.content.length,
          contentHash: sha256(row.content),
        })
      }
    } catch {
      // Snapshot persistence is best-effort; the actual prompt remains captured.
    }
  }
  return sources
}

/**
 * Drive a generation through the harness. The executor is unchanged; this adds
 * planning, run metadata, snapshot, trace stamping and deterministic+LLM quality.
 */
export async function runAimGenerate(
  input: AimGenerateHarnessInput
): Promise<AimGenerateHarnessOutput> {
  const outcome = await runAimHarness({
    traceId: input.trace?.id,
    plan: {
      entrypoint: input.entrypoint ?? "generate",
      // 阶段1：AimAgentId 类型已唯一化，但 input.agentId 仍是 string（route 接收的
      // 原始请求值，可能含未归一化别名）。强转暂保留，阶段2 入口迁到 executeAimRun
      // 时会在传入前归一化，届时移除此强转。
      agentId: input.agentId as AimRunSpec["agentId"],
      rawInput: input.rawInput,
      targetFormats: input.targetFormats,
      taskType: input.taskType,
      polishInstruction: input.polishInstruction,
      topicType: input.topicType,
      hotTopic: input.hotTopic,
      actorId: input.userId ?? undefined,
      projectId: input.projectId ?? undefined,
    },
    execute: async (spec) => {
      const result = await input.execute()
      return {
        output: result,
        contextManifest: await buildManifest(
          spec,
          input.citedKnowledgeIds ?? result.knowledgeUsed?.map((k) => k.id),
          input.contextManifest,
        ),
      }
    },
  })

  const result = outcome.output as AimGenerateResponse

  // Deterministic validation on every produced format.
  const qualityChecks: FormatValidationResult[] = result.results.map((item, index) =>
    validateFormat({
      format: item.format,
      content: item.content,
      minChars: 20,
      isMainDraft: index === 0 && MAIN_DRAFT_FORMATS.has(item.format),
    })
  )

  // Main-draft LLM report (read-only; never rewrites). Mirrors the route logic.
  let qualityReport: Record<string, unknown> | undefined
  let llmOverallPassed: boolean | undefined
  let llmRan = false
  if (input.runLlmQuality !== false) {
    const mainDraft = result.results.find(
      (item) => item.content?.trim() && MAIN_DRAFT_FORMATS.has(item.format)
    )
    if (mainDraft && input.agentId !== "persona" && input.agentId !== "free_copywriter" && input.taskType !== "polish_copy" && input.taskType !== "quality_check") {
      try {
        const report = await runQualityCheck({
          content: mainDraft.content,
          topicTitle: undefined,
        })
        llmRan = true
        llmOverallPassed = report.overall.passed
        qualityReport = {
          overallScore: report.overall.score,
          passed: report.overall.passed,
          editorial: report.editorial.score,
          aiTaste: report.aiTaste.score,
          attraction: report.attraction.score,
          logic: report.logic.score,
          compliance: report.compliance
            ? { passed: report.compliance.passed, violations: report.compliance.violations.length }
            : undefined,
        }
      } catch (error) {
        // Quality failure must never block the generation; surface as skipped.
        llmRan = false
        console.warn("[aim-harness] quality check failed:", error)
      }
    }
  }

  const qualityStatus = deriveQualityStatus({
    deterministic: qualityChecks,
    llmOverallPassed,
    llmRan,
  })

  // Persist snapshot (admin-only, 30-day) + stamp the trace long-term fields.
  if (input.persistSnapshot !== false) {
    const snapshotId = await persistAimRunSnapshot({
      runSpec: outcome.spec,
      metadata: outcome.metadata,
      contextManifest: outcome.contextManifest,
      composedPrompt: outcome.composedPrompt,
      promptMessages: outcome.promptMessages,
      output: result,
      qualityResult: { deterministic: qualityChecks, llm: qualityReport ?? null },
      imageHashes: outcome.imageHashes,
      traceId: input.trace?.id,
      userId: input.userId,
      projectId: input.projectId,
    })
    await applyRunMetadataToTrace(input.trace?.id, outcome.metadata, outcome.spec, snapshotId, qualityStatus)
  }

  return {
    result,
    runId: outcome.runId,
    degraded: outcome.metadata.degraded,
    provider: outcome.metadata.provider,
    model: outcome.metadata.model,
    qualityChecks,
    qualityStatus,
    qualityReport,
  }
}

// ── Chat adapter ───────────────────────────────────────────────────────────

export interface AimChatHarnessInput {
  /** non-stream executor: returns the chat content */
  execute: () => Promise<string>
  rawInput: string
  agentId: string
  /** chat history, for conversation-mode resolution */
  messages?: Array<{ role: "user" | "assistant"; content: string }>
  trace?: AimTraceRecorder
  userId?: string | null
  projectId?: string | null
  contextManifest?: AimContextSource[]
  persistSnapshot?: boolean
}

export interface AimChatHarnessOutput {
  content: string
  runId: string
  degraded: boolean
  provider: string
  model: string
}

/** Drive a non-stream chat through the harness. */
export async function runAimChat(input: AimChatHarnessInput): Promise<AimChatHarnessOutput> {
  const outcome = await runAimHarness({
    traceId: input.trace?.id,
    plan: {
      entrypoint: "chat",
      // 阶段1：AimAgentId 已唯一化；input.agentId 仍为 string，强转暂保留（见上文说明）。
      agentId: input.agentId as AimRunSpec["agentId"],
      rawInput: input.rawInput,
      targetFormats: [],
      messages: input.messages,
      actorId: input.userId ?? undefined,
      projectId: input.projectId ?? undefined,
    },
    execute: async () => {
      const content = await input.execute()
      return {
        output: content,
        contextManifest: input.contextManifest,
      }
    },
  })

  // Chat has no multi-format output; snapshot stores the single content string.
  if (input.persistSnapshot !== false) {
    const snapshotId = await persistAimRunSnapshot({
      runSpec: outcome.spec,
      metadata: outcome.metadata,
      contextManifest: outcome.contextManifest,
      composedPrompt: outcome.composedPrompt,
      promptMessages: outcome.promptMessages,
      output: outcome.output,
      imageHashes: outcome.imageHashes,
      traceId: input.trace?.id,
      userId: input.userId,
      projectId: input.projectId,
    })
    await applyRunMetadataToTrace(input.trace?.id, outcome.metadata, outcome.spec, snapshotId)
  }

  return {
    content: outcome.output as string,
    runId: outcome.runId,
    degraded: outcome.metadata.degraded,
    provider: outcome.metadata.provider,
    model: outcome.metadata.model,
  }
}

/**
 * Plan a stream chat run and return (runId, a function to stamp the trace once
 * the stream ends). Streaming can't await the whole run inside runAimHarness
 * (chunks must be emitted as they arrive), so we register telemetry here and
 * finalize metadata after the stream completes — matching the plan's
 * "streaming calls backfill trace via telemetry callback on completion".
 */
export async function planAimChatStream(input: {
  rawInput: string
  agentId: string
  messages?: Array<{ role: "user" | "assistant"; content: string }>
  trace?: AimTraceRecorder
  userId?: string | null
  projectId?: string | null
  contextManifest?: AimContextSource[]
}): Promise<{
  spec: AimRunSpec
  runId: string
  /** call after the stream finishes (success or failure) to persist snapshot + stamp trace */
  finalize: (fullOutput: string, ok: boolean) => Promise<void>
  capture: <T>(chunks: AsyncIterable<T>) => AsyncIterable<T>
}> {
  // Reuse runAimHarness with a no-op executor to get a spec + telemetry
  // callback registration, but we discard its execution; the caller streams.
  // To keep telemetry scoped to this stream, we plan + register here directly.
  const { planAimRun } = await import("./planner")
  const { hashPrompt, hashContextManifest } = await import("./hashing")
  const { HARNESS_VERSION } = await import("./types")
  const { randomUUID } = await import("node:crypto")

  const spec = planAimRun({
    entrypoint: "chat",
    // 阶段1：AimAgentId 已唯一化；input.agentId 仍为 string，强转暂保留（见上文说明）。
    agentId: input.agentId as AimRunSpec["agentId"],
    rawInput: input.rawInput,
    targetFormats: [],
    messages: input.messages,
    actorId: input.userId ?? undefined,
    projectId: input.projectId ?? undefined,
  })
  const runId = `run_${randomUUID().replace(/-/g, "").slice(0, 28)}`

  const attempts: ProviderAttempt[] = []
  const invocations: LlmInvocation[] = []
  const recorder = {
    onAttempt: (attempt: ProviderAttempt) => attempts.push(attempt),
    onInvocation: (invocation: LlmInvocation) => invocations.push(invocation),
  }
  const capture = <T,>(chunks: AsyncIterable<T>) => wrapLlmTelemetryIterable(recorder, chunks)

  const finalize = async (fullOutput: string, ok: boolean) => {
    const successful = [...attempts].reverse().find((a) => a.status === "success") ?? attempts[attempts.length - 1]
    const failed = attempts.filter((a) => a.status === "failed")
    const composedPrompt = invocations.length > 0
      ? invocations.map((invocation, index) => `=== LLM INVOCATION ${index + 1} ===\n${invocation.fullPrompt}`).join("\n\n")
      : input.rawInput
    const contextManifest = input.contextManifest ?? [{
      kind: "request" as const,
      id: "raw_input",
      charCount: input.rawInput.length,
      contentHash: sha256(input.rawInput),
    }]
    const metadata = {
      runId,
      harnessVersion: HARNESS_VERSION,
      provider: successful?.provider ?? "unknown",
      model: successful?.responseModel ?? successful?.model ?? "unknown",
      fallbackIndex: successful?.attemptIndex ?? 0,
      degraded: failed.length > 0 && !!successful && ok,
      promptHash: hashPrompt(composedPrompt),
      contextHash: hashContextManifest(contextManifest),
      providerAttempts: attempts,
    }
    await persistAimRunSnapshot({
      runSpec: spec,
      metadata,
      contextManifest,
      composedPrompt,
      promptMessages: invocations.map((invocation) => invocation.messages),
      output: fullOutput,
      imageHashes: invocations.flatMap((invocation) => invocation.imageHashes),
      traceId: input.trace?.id,
      userId: input.userId,
      projectId: input.projectId,
    })
    await applyRunMetadataToTrace(input.trace?.id, metadata, spec)
  }

  return { spec, runId, finalize, capture }
}
