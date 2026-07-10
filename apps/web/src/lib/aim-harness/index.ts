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
