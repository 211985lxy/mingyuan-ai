/**
 * AIM Harness v2 — 唯一执行入口（阶段 1.3 引入骨架，阶段 2.4 真正接管非流式）。
 *
 * executeAimRun / streamAimRun 是"Harness 作为 AIM 唯一执行内核"的对外入口。
 * 四个服务端入口（generate / chat / agent_api / inspiration）在阶段 2 将逐个
 * 从旧 adapter（runAimGenerate / runAimChat / planAimChatStream）切换到这里。
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
  AimAgentOutput,
} from "./contracts"
import { normalizeAimAgentId, isValidAimAgent } from "./contracts"
import { runAimHarness } from "./runner"
import type { RunAimExecutionResult } from "./runner"
import type { PlanRunInput } from "./planner"
import type { AimRunSpec } from "./types"
import { flagAimGenerationDegraded } from "./persistence"

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
    messages: request.messages,
    actorId: request.actorId,
    projectId: request.projectId,
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
export interface ExecuteAimRunAdapter {
  (spec: AimRunSpec): Promise<RunAimExecutionResult & {
    /** 落库的生成记录 id（draftOnly / skipPersistence 时为 undefined） */
    generationId?: string
    /** 主稿 LLM 质检报告（runLlmQuality 关闭时为 undefined） */
    qualityReport?: Record<string, unknown>
    /** 质检状态（pass/warn/fail/skipped） */
    qualityStatus?: "pass" | "warn" | "fail" | "skipped"
  }>
}

export async function executeAimRun(
  request: AimRunRequest,
  execute: ExecuteAimRunAdapter,
): Promise<AimRunResult> {
  // 规整 + 归一化（agentId 非法时 getAgentHandler 下游兜底，这里不强抛）。
  const plan = toPlanInput(request)

  // 适配器扩展结果（generationId / qualityReport / qualityStatus）通过闭包变量回传。
  let partial: RunAimExecutionResult & {
    generationId?: string
    qualityReport?: Record<string, unknown>
    qualityStatus?: "pass" | "warn" | "fail" | "skipped"
  } | undefined

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
  const output = execResult.output as unknown as AimAgentOutput

  const generationId = partial?.generationId
  const qualityReport = partial?.qualityReport

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
    traceId: request.trace?.id,
    qualityReport,
    spec,
  }
}

/**
 * 流式唯一入口（阶段 1.3 骨架）。
 *
 * 阶段 1 仅声明形态：返回一个 stream handle（spec + runId + 产出 async iterable
 * 的工厂）。真正的 lifecycle 合并（统一 runId / telemetry / 快照，删除
 * planAimChatStream 三处散落）在阶段 2.5 完成。本骨架当前不被入口调用，供阶段 2
 * 迁移流式 chat 时替换 planAimChatStream。
 */
export interface AimStreamHandle {
  spec: AimRunSpec
  runId: string
  /** 由调用方把 handler 的 async iterable 注入，内部捕获 telemetry 并在流结束后 finalize */
  stream: (chunks: AsyncIterable<string>) => AsyncIterable<string>
  /** 流结束后调用（成功或失败），持久化快照 + 盖 trace */
  finalize: (fullOutput: string, ok: boolean) => Promise<void>
}

export async function streamAimRun(_request: AimRunRequest): Promise<AimStreamHandle> {
  // 阶段 1.3 骨架：形态占位。阶段 2.5 实现：
  //   - runId 统一走 runner 的 makeRunId（删除 adapters.ts:357 独立 randomUUID）
  //   - telemetry 统一走 runWithLlmTelemetry（删除 wrapLlmTelemetryIterable 独立收集）
  //   - 快照统一一处 persistAimRunSnapshot（删除 finalize 手写 metadata）
  //   - 与 executeAimRun 共享 plan / telemetry / snapshot lifecycle
  throw new Error(
    "streamAimRun: 阶段 1.3 仅声明形态，阶段 2.5 才实现。当前流式入口仍走 planAimChatStream。",
  )
}

/**
 *（阶段 2 内部用）统一上下文装配入口。阶段 2.2 已实现，见 context-assembly.ts。
 * runtime 保留 re-export，使入口可统一从 aim-harness/runtime 或 aim-harness/index 取用。
 */
export { prepareAimContext, type PrepareAimContextInput } from "./context-assembly"

export { normalizeAimAgentId, isValidAimAgent }
