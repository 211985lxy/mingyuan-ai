/**
 * AIM Harness v2 — 唯一执行入口（阶段 1.3 引入骨架，阶段 2 真正接管）。
 *
 * executeAimRun / streamAimRun 是"Harness 作为 AIM 唯一执行内核"的对外入口。
 * 四个服务端入口（generate / chat / agent_api / inspiration）在阶段 2 将逐个
 * 从旧 adapter（runAimGenerate / runAimChat / planAimChatStream）切换到这里。
 *
 * ── 阶段 1.3（本提交）：骨架委托，行为零变化 ──
 * 入口仍需调用方注入 execute 闭包（上下文装配在阶段 2.2 才下沉到
 * prepareAimContext）。这里只做：把 AimRunRequest 规整为 planner 入参 → 复用
 * runAimHarness → 把 outcome 包装成 AimRunResult。目的是先确立"唯一入口"形态，
 * 让阶段 2 的入口迁移有明确目标，且阶段 1 全程不改变任何运行时行为。
 *
 * ── 阶段 2.4/2.5（后续提交）──
 * executeAimRun 内化 plan → prepareAimContext → handler → 质检 → 持久化收口；
 * streamAimRun 吃掉 runId / telemetry / 快照三处散落，与 executeAimRun 共享 lifecycle。
 */

import type {
  AimRunRequest,
  AimRunResult,
  PreparedAimContext,
  AimAgentOutput,
} from "./contracts"
import { normalizeAimAgentId, isValidAimAgent } from "./contracts"
import { runAimHarness } from "./runner"
import type { RunAimExecutionResult } from "./runner"
import type { PlanRunInput } from "./planner"
import type { AimRunSpec } from "./types"

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
 * 非流式唯一入口（阶段 1.3 骨架）。
 *
 * @param request 唯一运行请求
 * @param execute 过渡期的执行闭包：接收冻结 spec，驱动现有 handler 并返回其原始产出
 *                + contextManifest（阶段 2.2 prepareAimContext 接管后此参数移除）
 *
 * 阶段 1 行为等价于现有 adapter：plan → runAimHarness(execute) → 包装 AimRunResult。
 */
export async function executeAimRun(
  request: AimRunRequest,
  execute: (spec: AimRunSpec) => Promise<RunAimExecutionResult>,
): Promise<AimRunResult> {
  // 规整 + 归一化（agentId 非法时 getAgentHandler 下游兜底，这里不强抛）。
  const plan = toPlanInput(request)

  const outcome = await runAimHarness({
    traceId: request.trace?.id,
    plan,
    execute,
  })

  const spec = withSpecOverrides(outcome.spec, request)

  // 阶段 1：output 形状仍是各 handler 的原始返回（generate 为 AimGenerateResponse，
  // chat 为 string）。阶段 2.3 handler 改返回 AimAgentOutput 后，这里直接用。
  const output = outcome.output as unknown as AimAgentOutput

  return {
    metadata: outcome.metadata,
    output,
    traceId: request.trace?.id,
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
 *（阶段 2 内部用）统一上下文装配入口占位。阶段 2.2 实现 prepareAimContext。
 */
export async function prepareAimContext(_spec: AimRunSpec): Promise<PreparedAimContext> {
  throw new Error(
    "prepareAimContext: 阶段 2.2 实现。阶段 1 上下文装配仍分散在 route + handler。",
  )
}

export { normalizeAimAgentId, isValidAimAgent }
