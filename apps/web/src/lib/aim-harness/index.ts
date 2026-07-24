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

export { HARNESS_VERSION, AIM_EXECUTION_MODES } from "./types"
export type {
  AimAgentId,
  AimContextPolicy,
  AimContextSource,
  AimContextTrustLevel,
  AimEntrypoint,
  AimExecutionMode,
  AimExecutionPolicy,
  AimHarnessResult,
  AimModelPolicy,
  AimRunMetadata,
  AimRunSpec,
  AimRunStopReason,
} from "./types"

export {
  BOUNDED_TOOL_LOOP_ALLOWLIST,
  DEFAULT_EXECUTION_MAX_STEPS,
  DEFAULT_EXECUTION_TIMEOUT_MS,
  isBoundedToolLoopAllowed,
  resolveExecutionMode,
  resolveExecutionPolicy,
  shouldAutoEnableBoundedToolLoop,
} from "./execution-mode"

export { runBoundedToolLoop } from "./tool-loop"
export { loadAimSkills, buildAimSkillBlock, selectAimSkills } from "./skill-loader"
export { buildEvalCandidateFromRunSummary } from "./eval-candidate-from-trace"
export type { TraceEvalCandidateDraft } from "./eval-candidate-from-trace"
export {
  resolveDefaultTrustLevel,
  withDefaultTrustLevel,
  sanitizeUntrustedContextText,
  maybeSanitizeContextBlock,
} from "./context-trust"
export {
  AIM_TOOL_REGISTRY,
  assertToolRegistered,
  assertToolAllowedInToolLoop,
  listToolLoopTools,
} from "./tool-registry"
export {
  classifyAimRunError,
  mapToolLoopStopToErrorKind,
} from "./run-errors"
export type { AimRunErrorKind, AimStopReason } from "./run-errors"
export { classifyModelSwapBottleneck } from "./eval-model-swap"
export {
  assessContentRolloutPromotion,
  CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES,
  CONTENT_ROLLOUT_MIN_WORKDAYS,
} from "./content-rollout-gate"
export type {
  ContentRolloutEvidence,
  ContentRolloutGateResult,
  ContentRolloutLevel,
} from "./content-rollout-gate"
export {
  MEMORY_EVAL_SUITE,
  isMemoryEligibleForProductionRecall,
  runMemoryEvalSuite,
  renderMemoryEvalMarkdown,
} from "./memory-eval"
export type { MemoryEvalItem, MemoryEvalReport } from "./memory-eval"

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
