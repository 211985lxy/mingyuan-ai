/**
 * AIM Thin Harness v1 — public surface.
 *
 * The harness is a thin telemetry/orchestration layer over the existing AIM
 * domain handlers. It does not reimplement prompt assembly, context loading or
 * the agent handlers; those remain the source of truth. The harness adds:
 *   - normalized AimRunSpec (single parse of task/intent/knowledge strategy)
 *   - runId + real provider/model + fallbackIndex + degraded on every call
 *   - promptHash (content hash as the real version) + contextHash
 *   - AimRunSnapshot persistence (admin-only, 30-day TTL) + long-term trace fields
 *   - deterministic validators on every format + LLM report on the main draft
 */

export { HARNESS_VERSION } from "./types"
export type {
  AimAgentId,
  AimContextPolicy,
  AimContextSource,
  AimEntrypoint,
  AimHarnessResult,
  AimModelPolicy,
  AimRunMetadata,
  AimRunSpec,
} from "./types"

// v2 运行时契约（升级阶段 1.2）：身份契约 + 请求/上下文/产出/结果类型。
// AimAgentId / AimEntrypoint 仍从 ./types re-export（上方），保持既有导入路径稳定。
export {
  AIM_AGENT_IDS,
  DEFAULT_AIM_AGENT,
  LEGACY_AGENT_ID_ALIASES,
  normalizeAimAgentId,
  isValidAimAgent,
} from "./contracts"
export type {
  AimRunRequest,
  PreparedAimContext,
  AimAgentOutput,
  AimRunResult,
  AimChatTurn,
} from "./contracts"

export { planAimRun } from "./planner"
export type { PlanRunInput } from "./planner"

export { runAimHarness } from "./runner"
export type { AimHarnessOutcome, RunAimExecutionResult, RunAimHarnessInput } from "./runner"

export {
  persistAimRunSnapshot,
  applyRunMetadataToTrace,
} from "./snapshot"

export { validateFormat, deriveQualityStatus } from "./validators"
export type {
  DeterministicValidationInput,
  FormatValidationResult,
} from "./validators"

export { hashPrompt, hashContextManifest, hashImageBytes } from "./hashing"

// v2 唯一执行入口（阶段 1.3 骨架，阶段 2 接管）。入口迁移后四入口都从这里进。
export {
  executeAimRun,
  streamAimRun,
  prepareAimContext,
} from "./runtime"
export type { AimStreamHandle } from "./runtime"
