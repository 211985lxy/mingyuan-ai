/**
 * AimExecutionPolicy 授权与默认值（14 周正本阶段 1/3）。
 *
 * bounded_tool_loop 白名单：销售补证 + 选题/内容核验。
 * 生产默认仍 single_shot；白名单路径在 AIM_BOUNDED_TOOL_LOOP_ENABLED=true 时自动开启。
 */

import { env } from "@/env"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import type {
  AimAgentId,
  AimExecutionMode,
  AimExecutionPolicy,
} from "./types"
import { BOUND_TOOL_LOOP_TOOL_NAMES } from "./tool-loop-tools"

export const DEFAULT_EXECUTION_MAX_STEPS = 6
export const DEFAULT_EXECUTION_TIMEOUT_MS = 60_000
export const DEFAULT_EXECUTION_MAX_AUTO_RETRIES = 1
export const DEFAULT_TOOL_TIMEOUT_MS = 10_000

export interface BoundedToolLoopGrant {
  agentId: AimAgentId
  runtimeTask?: AimRuntimeTask
  /** 为 true 时，环境开关打开后 planner 自动选用 bounded_tool_loop */
  autoEnable?: boolean
}

/**
 * 允许进入 BoundedToolLoop 的 (agent, runtimeTask) 白名单。
 * - business_diagnosis + positioning_topic：销售/定位补证
 * - content_producer + new_copy / positioning_topic：选题/新稿前核验
 */
export const BOUNDED_TOOL_LOOP_ALLOWLIST: readonly BoundedToolLoopGrant[] = [
  { agentId: "business_diagnosis", runtimeTask: "positioning_topic", autoEnable: true },
  { agentId: "content_producer", runtimeTask: "new_copy", autoEnable: true },
  { agentId: "content_producer", runtimeTask: "positioning_topic", autoEnable: true },
]

export function isBoundedToolLoopAllowed(
  agentId: AimAgentId,
  runtimeTask: AimRuntimeTask,
): boolean {
  return BOUNDED_TOOL_LOOP_ALLOWLIST.some(
    (grant) =>
      grant.agentId === agentId &&
      (grant.runtimeTask === undefined || grant.runtimeTask === runtimeTask),
  )
}

export function isBoundedToolLoopEnvEnabled(): boolean {
  return env.AIM_BOUNDED_TOOL_LOOP_ENABLED?.trim().toLowerCase() === "true"
}

export function shouldAutoEnableBoundedToolLoop(
  agentId: AimAgentId,
  runtimeTask: AimRuntimeTask,
): boolean {
  if (!isBoundedToolLoopEnvEnabled()) return false
  return BOUNDED_TOOL_LOOP_ALLOWLIST.some(
    (grant) =>
      grant.autoEnable === true &&
      grant.agentId === agentId &&
      (grant.runtimeTask === undefined || grant.runtimeTask === runtimeTask),
  )
}

export function resolveExecutionMode(input: {
  requested?: AimExecutionMode
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
}): AimExecutionMode {
  return resolveExecutionPolicy(input).mode
}

/**
 * @description 解析并冻结执行策略；未授权 tool loop 抛错
 */
export function resolveExecutionPolicy(input: {
  requested?: AimExecutionMode
  policy?: Partial<AimExecutionPolicy>
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
}): AimExecutionPolicy {
  const requestedMode = input.policy?.mode ?? input.requested
  const auto =
    !requestedMode && shouldAutoEnableBoundedToolLoop(input.agentId, input.runtimeTask)
      ? "bounded_tool_loop"
      : undefined
  const mode = requestedMode ?? auto ?? "single_shot"
  if (mode !== "single_shot" && mode !== "bounded_tool_loop") {
    throw new Error(`unsupported executionMode: ${String(mode)}`)
  }
  if (mode === "bounded_tool_loop" && !isBoundedToolLoopAllowed(input.agentId, input.runtimeTask)) {
    throw new Error(
      `bounded_tool_loop 未授权：agent=${input.agentId} runtimeTask=${input.runtimeTask}。` +
        "须先加入 BOUNDED_TOOL_LOOP_ALLOWLIST。",
    )
  }

  const allowedToolNames =
    mode === "bounded_tool_loop"
      ? [...(input.policy?.allowedToolNames ?? BOUND_TOOL_LOOP_TOOL_NAMES)]
      : []

  if (mode === "bounded_tool_loop") {
    for (const name of allowedToolNames) {
      if (!(BOUND_TOOL_LOOP_TOOL_NAMES as readonly string[]).includes(name)) {
        throw new Error(`executionPolicy 含未注册工具：${name}`)
      }
    }
  }

  return Object.freeze({
    mode,
    allowedToolNames: Object.freeze(allowedToolNames) as string[],
    maxSteps: input.policy?.maxSteps ?? DEFAULT_EXECUTION_MAX_STEPS,
    timeoutMs: input.policy?.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS,
    maxAutoRetries: input.policy?.maxAutoRetries ?? DEFAULT_EXECUTION_MAX_AUTO_RETRIES,
  })
}
