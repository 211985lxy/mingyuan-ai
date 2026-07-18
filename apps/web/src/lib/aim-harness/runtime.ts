/**
 * AIM Harness v2 — 唯一执行入口（阶段 1.3 引入骨架，阶段 2.4 真正接管非流式）。
 *
 * executeAimRun / streamAimRun 是"Harness 作为 AIM 唯一执行内核"的对外入口。
 * 四个服务端入口（generate / chat / agent_api / inspiration）均通过本模块执行。
 *
 * ── 阶段 2.4（本提交）：executeAimRun 内化非流式编排 ──
 * 入口形态确立后，executeAimRun 现在承担：
 *   - 规整 AimRunRequest（agentId 归一化 + 质检/落库开关透传到 spec）
 *   - runAimHarness 驱动执行（spec 冻结 + telemetry + runId 统一生成）
 *   - 质检结果回填（execute 闭包产出 qualityReport）
 *   - **修复 degraded 语义裂缝**：provider fallback 降级时，回标 AimGeneration.status
 *     对齐 snapshot/trace 的 degraded 语义（此前 AimGeneration 永远 completed）
 *
 * execute 闭包仍由调用方注入（驱动现有 handler），但 2.4 起闭包需回传 generationId /
 * qualityReport，供内核组装 AimRunResult + 降级回标。阶段 3 handler 拆分后，
 * 内核直接调 prepareAimContext + handler.generate，闭包移除。
 *
 * ── 阶段 2.5（后续提交）──
 * streamAimRun 吃掉 runId / telemetry / 快照三处散落，与 executeAimRun 共享 lifecycle。
 */

import type {
  AimRunRequest,
  AimRunResult,
} from "./contracts"
import { normalizeAimAgentId, isValidAimAgent } from "./contracts"
import { runAimHarness, makeRunId } from "./runner"
import type { RunAimExecutionResult, AimHarnessOutcome } from "./runner"
import { planAimRun } from "./planner"
import type { PlanRunInput } from "./planner"
import type { AimRunSpec, AimContextSource, AimRunMetadata } from "./types"
import { HARNESS_VERSION } from "./types"
import { hashPrompt, hashContextManifest, sha256 } from "./hashing"
import { persistAimRunSnapshot, applyRunMetadataToTrace } from "./snapshot"
import { wrapLlmTelemetryIterable } from "@/lib/llm/telemetry"
import type { LlmInvocation, ProviderAttempt } from "@/lib/llm/telemetry"
import { flagAimGenerationDegraded } from "./persistence"
import { buildAimContextManifest } from "./manifest"
import { assessAimGeneration, isAimGenerationLike } from "./quality"

/**
 * 规整 AimRunRequest → planner 入参。
 * - agentId 归一化（接受旧别名）；
 * - 把 v2 请求字段映射到 PlanRunInput 的既有字段；
 * - runLlmQuality / draftOnly 透传到 spec（types.ts 已增补这两字段）。
 *
 * 注意：阶段 1 仅做字段搬运，不在此解析 runtimeTask / knowledgeStrategy（仍由
 * planner 内部解析）；request 上若已带覆盖值则透传，由 planner 决定是否采用。
 */
function toPlanInput(request: AimRunRequest): PlanRunInput {
  const normalized = normalizeAimAgentId(request.agentId)
  return {
    entrypoint: request.entrypoint,
    // normalized 已是规范 id（或未知 string）；planner/getAgentHandler 会兜底回退。
    agentId: normalized as PlanRunInput["agentId"],
    rawInput: request.rawInput,
    targetFormats: request.targetFormats ?? [],
    taskType: request.taskType,
    polishInstruction: request.polishInstruction,
    topicType: request.topicType,
    hotTopic: request.hotTopic,
    videoCopyExtractionId: request.videoCopyExtractionId,
    contentScenario: request.contentScenario,
    messages: request.messages,
    actorId: request.actorId,
    projectId: request.projectId,
    stream: request.stream,
    runtimeTask: request.runtimeTask,
    knowledgeStrategy: request.knowledgeStrategy,
    conversationMode: request.conversationMode,
    agentModule: request.agentModule,
    writerModule: request.writerModule,
  }
}

/**
 * 把 AimRunRequest 转成 AimRunSpec 的补充字段（draftOnly / runLlmQuality）。
 * planner 当前不读这两字段（它在阶段 2.1 才冻结），这里先把它们挂到 spec 上，
 * 供阶段 2 的质检/持久化决策使用。阶段 1 骨架暂不消费，仅保证结构就位。
 */
function withSpecOverrides(spec: AimRunSpec, request: AimRunRequest): AimRunSpec {
  return {
    ...spec,
    draftOnly: request.draftOnly ?? spec.draftOnly,
    runLlmQuality: request.runLlmQuality ?? spec.runLlmQuality,
  }
}

/**
 * 非流式唯一入口（阶段 2.4 真内核）。
 *
 * @param request 唯一运行请求
 * @param execute 过渡期执行适配器：接收冻结 spec，驱动现有 handler/adapter，回传
 *                { output, contextManifest, generationId?, qualityReport?, qualityStatus? }
 *                （阶段 3 handler 拆分后，内核直接调 prepareAimContext + handler，此参数移除）
 *
 * 流程：plan（spec 冻结）→ runAimHarness(execute)（telemetry + runId 统一生成）
 *       → 组装 AimRunResult → 若 metadata.degraded 且落了 AimGeneration，回标 status。
 *
 * degraded 语义裂缝修复：此前 AimGeneration.status 永远 "completed"，与 snapshot/trace
 * 的 degraded:true 不一致；现在 provider fallback 降级时，回标 AimGeneration.status
 * 为 "degraded"，使三处（generation / snapshot / trace）语义对齐。
 */
export interface ExecuteAimRunAdapter<TOutput = unknown> {
  (spec: AimRunSpec): Promise<Omit<RunAimExecutionResult, "output"> & {
    output: TOutput
    /** 落库的生成记录 id（draftOnly / skipPersistence 时为 undefined） */
    generationId?: string
    /** 主稿 LLM 质检报告（runLlmQuality 关闭时为 undefined） */
    qualityReport?: Record<string, unknown>
    /** 质检状态（pass/warn/fail/skipped） */
    qualityStatus?: "pass" | "warn" | "fail" | "skipped"
  }>
}

export async function executeAimRun<TOutput = unknown>(
  request: AimRunRequest,
  execute: ExecuteAimRunAdapter<TOutput>,
): Promise<AimRunResult<TOutput>> {
  // 规整 + 归一化（agentId 非法时 getAgentHandler 下游兜底，这里不强抛）。
  const plan = toPlanInput(request)

  // 适配器扩展结果（generationId / qualityReport / qualityStatus）通过闭包变量回传。
  let partial: (Omit<RunAimExecutionResult, "output"> & {
    output: TOutput
    generationId?: string
    qualityReport?: Record<string, unknown>
    qualityStatus?: "pass" | "warn" | "fail" | "skipped"
  }) | undefined

  const execResult = await runAimHarness({
    traceId: request.trace?.id,
    plan,
    execute: async (spec) => {
      const adapted = await execute(spec)
      // runAimHarness 只消费 output + contextManifest；其余字段通过闭包变量回传。
      partial = adapted
      return {
        output: adapted.output,
        contextManifest: adapted.contextManifest,
        composedPrompt: adapted.composedPrompt,
      }
    },
  })

  const spec = withSpecOverrides(execResult.spec, request)

  // output 形状仍是各 handler 的原始返回（generate 为 AimGenerateResponse，chat 为 string）。
  // 阶段 3 handler 改返回 AimAgentOutput 后这里直接用；当前以 unknown 透传 + 按需断言。
  const output = execResult.output as TOutput

  const legacyGenerationId =
    output && typeof output === "object" && "id" in output
      ? String((output as { id: unknown }).id)
      : undefined
  const generationId = partial?.generationId ?? legacyGenerationId

  const { qualityReport, qualityChecks, qualityStatus, snapshotId } = await finalizeRunResult({
    spec,
    output,
    partial,
    request,
    execResult,
  })

  // ── degraded 语义裂缝修复：provider fallback 降级时回标 AimGeneration.status ──
  // 仅在确实落了生成记录（非 draftOnly / 非 skipPersistence）且运行降级时回标。
  if (execResult.metadata.degraded && generationId && request.actorId) {
    await flagAimGenerationDegraded(generationId, request.actorId).catch(() => {
      // 回标是 best-effort：失败不阻断已完成的生成（snapshot/trace 已记录 degraded）。
    })
  }

  return {
    metadata: execResult.metadata,
    output,
    generationId,
    snapshotId,
    traceId: request.trace?.id,
    qualityReport,
    qualityChecks,
    qualityStatus,
    spec,
  }
}

/**
 * 执行收尾：质量评估 → contextManifest 构建 → 快照持久化 + trace 回填。
 * 从 executeAimRun 逐字迁出，顺序、门控、persistSnapshot !== false 条件一字不改。
 */
async function finalizeRunResult<TOutput>(input: {
  spec: AimRunSpec
  output: TOutput
  partial: (Omit<RunAimExecutionResult, "output"> & {
    output: TOutput
    generationId?: string
    qualityReport?: Record<string, unknown>
    qualityStatus?: "pass" | "warn" | "fail" | "skipped"
  }) | undefined
  request: AimRunRequest
  execResult: AimHarnessOutcome
}) {
  const { spec, output, partial, request, execResult } = input

  let qualityReport = partial?.qualityReport
  let qualityStatus = partial?.qualityStatus
  let qualityChecks: import("./validators").FormatValidationResult[] | undefined

  if (isAimGenerationLike(output)) {
    const quality = await assessAimGeneration({
      output,
      agentId: spec.agentId,
      taskType: request.taskType,
      runLlmQuality: request.runLlmQuality,
    })
    qualityReport = qualityReport ?? quality.qualityReport
    qualityStatus = qualityStatus ?? quality.qualityStatus
    qualityChecks = quality.qualityChecks
  }

  const citedKnowledgeIds =
    output && typeof output === "object" && "knowledgeUsed" in output
      ? ((output as { knowledgeUsed?: Array<{ id?: unknown }> }).knowledgeUsed ?? [])
          .map((item) => typeof item.id === "string" ? item.id : "")
          .filter(Boolean)
      : undefined
  const contextManifest = await buildAimContextManifest({
    spec,
    userId: request.actorId,
    projectId: request.projectId,
    citedKnowledgeIds,
    provided: partial?.contextManifest,
  })

  let snapshotId: string | undefined
  if (request.persistSnapshot !== false) {
    snapshotId = await persistAimRunSnapshot({
      runSpec: spec,
      metadata: execResult.metadata,
      contextManifest,
      composedPrompt: execResult.composedPrompt,
      promptMessages: execResult.promptMessages,
      output,
      qualityResult: isAimGenerationLike(output)
        ? { deterministic: qualityChecks ?? [], llm: qualityReport ?? null }
        : undefined,
      imageHashes: execResult.imageHashes,
      traceId: request.trace?.id,
      userId: request.actorId,
      projectId: request.projectId,
    })
    await applyRunMetadataToTrace(
      request.trace?.id,
      execResult.metadata,
      spec,
      snapshotId,
      qualityStatus,
    )
  }

  return { qualityReport, qualityChecks, qualityStatus, snapshotId }
}

/**
 * 流式唯一入口（阶段 2.5 真内核）。
 *
 * 与 executeAimRun 共享 plan / runId / telemetry / snapshot lifecycle，吃掉此前
 * 流式路径同样统一以下生命周期：
 *   - runId 统一走 runner.makeRunId（此前 adapters.ts 独立 randomUUID）
 *   - telemetry 用 wrapLlmTelemetryIterable 包裹流（流式专用；与 runWithLlmTelemetry
 *     共享 ProviderAttempt/LlmInvocation 结构）
 *   - 快照统一走 persistAimRunSnapshot + applyRunMetadataToTrace（此前 finalize 手写 metadata）
 *
 * 返回 AimStreamHandle：调用方把 handler 的 async iterable 注入 stream()，流结束后
 * 调 finalize()（成功或失败）持久化快照 + 盖 trace。流式无法像非流式那样在 runAimHarness
 * 内 await 整条流，故 plan + telemetry 注册在此完成，metadata 在 finalize 组装。
 */
export interface AimStreamHandle {
  spec: AimRunSpec
  runId: string
  /** 把 handler 的 async iterable 注入，内部捕获 telemetry 后原样产出（逐字不变） */
  stream: (chunks: AsyncIterable<string>) => AsyncIterable<string>
  /** 流结束后调用（成功或失败），持久化快照 + 盖 trace */
  finalize: (fullOutput: string, ok: boolean) => Promise<void>
}

export async function streamAimRun(request: AimRunRequest): Promise<AimStreamHandle> {
  const plan = toPlanInput(request)
  const spec = planAimRun(plan)
  // runId 统一走 runner.makeRunId（与 executeAimRun / runAimHarness 同源）
  const runId = makeRunId()

  const attempts: ProviderAttempt[] = []
  const invocations: LlmInvocation[] = []
  const recorder = {
    onAttempt: (attempt: ProviderAttempt) => attempts.push(attempt),
    onInvocation: (invocation: LlmInvocation) => invocations.push(invocation),
  }
  // 流式 telemetry：包裹 async iterable，捕获 provider attempt / invocation
  const stream = (chunks: AsyncIterable<string>) => wrapLlmTelemetryIterable(recorder, chunks)

  const finalize = async (fullOutput: string, ok: boolean) => {
    const successful =
      [...attempts].reverse().find((a) => a.status === "success") ?? attempts[attempts.length - 1]
    const failed = attempts.filter((a) => a.status === "failed")
    const composedPrompt = invocations.length > 0
      ? invocations.map((invocation, index) => `=== LLM INVOCATION ${index + 1} ===\n${invocation.fullPrompt}`).join("\n\n")
      : request.rawInput
    // 来源清单：调用方若提供（request 侧）则用，否则回退到 rawInput 单条
    const contextManifest: AimContextSource[] = request.contextManifest ?? [{
        kind: "request",
        id: "raw_input",
        charCount: request.rawInput.length,
        contentHash: sha256(request.rawInput),
      }]
    const metadata: AimRunMetadata = {
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
    if (request.persistSnapshot !== false) {
      await persistAimRunSnapshot({
        runSpec: spec,
        metadata,
        contextManifest,
        composedPrompt,
        promptMessages: invocations.map((invocation) => invocation.messages),
        output: fullOutput,
        imageHashes: invocations.flatMap((invocation) => invocation.imageHashes),
        traceId: request.trace?.id,
        userId: request.actorId,
        projectId: request.projectId,
      })
      await applyRunMetadataToTrace(request.trace?.id, metadata, spec)
    }
  }

  return { spec, runId, stream, finalize }
}

/**
 *（阶段 2 内部用）统一上下文装配入口。阶段 2.2 已实现，见 context-assembly.ts。
 * runtime 保留 re-export，使入口可统一从 aim-harness/runtime 或 aim-harness/index 取用。
 */
export { prepareAimContext, type PrepareAimContextInput } from "./context-assembly"

export { normalizeAimAgentId, isValidAimAgent }
