/**
 * Execution mode for the inspiration pipeline.
 *
 * Three levels: capture_only → evaluate → live.
 *
 * - `capture_only`  Record and extract only; no AI generation, no replies.
 * - `evaluate`      Generate candidates but do NOT write TopicSelection or reply.
 * - `live`          Full pipeline: extract → generate → write TopicSelection → reply.
 *
 * The global environment variable INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE
 * acts as a degradation ceiling only — it can demote a binding's mode but never
 * promote it. For backward compatibility, INSPIRATION_PIPELINE_SHADOW_MODE=true
 * is mapped to capture_only.
 */

export const EXECUTION_MODES = ["capture_only", "evaluate", "live"] as const

export type ExecutionMode = (typeof EXECUTION_MODES)[number]

const EXECUTION_MODE_ORDER: Record<ExecutionMode, number> = {
  capture_only: 0,
  evaluate: 1,
  live: 2,
}

/** Check if a value is a valid ExecutionMode. */
/**
 * @description 判断是否executionmode
 * @param value - 值
 * @returns value is ExecutionMode
 */
export function isExecutionMode(value: unknown): value is ExecutionMode {
  return typeof value === "string" && (EXECUTION_MODES as readonly string[]).includes(value)
}

/**
 * Resolve the effective execution mode for a single task.
 *
 * @param bindingMode  The mode configured on the ChannelBinding.
 * @param globalOverride  Value of INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE (optional).
 * @returns The effective mode. The override can only demote, never promote.
 */
/**
 * @description 解析executionmode
 * @param bindingMode - binding模式
 * @param globalOverride? - globalOverride?
 * @returns ExecutionMode
 */
export function resolveExecutionMode(
  bindingMode: ExecutionMode,
  globalOverride?: string,
): ExecutionMode {
  const override = globalOverride && isExecutionMode(globalOverride) ? globalOverride : null

  // No override → use binding mode as-is
  if (!override) return bindingMode

  // Override can only demote (lower or equal priority)
  if (EXECUTION_MODE_ORDER[override] <= EXECUTION_MODE_ORDER[bindingMode]) {
    return override
  }

  // Override would promote — ignore it, keep binding mode
  return bindingMode
}

/**
 * Whether the given effective mode suppresses outgoing replies.
 * Both capture_only and evaluate suppress replies; only live sends them.
 */
/**
 * @description 判断是否replysuppressed
 * @param mode - 模式
 * @returns boolean
 */
export function isReplySuppressed(mode: ExecutionMode | null | undefined): boolean {
  if (!mode) return false
  return mode !== "live"
}

/**
 * Whether the given effective mode suppresses AI generation and TopicSelection writes.
 * Only live runs the full generation pipeline.
 * Null/undefined (backward compat for records without snapshot) is treated as live.
 */
/**
 * @description 判断是否generationsuppressed
 * @param mode - 模式
 * @returns boolean
 */
export function isGenerationSuppressed(mode: ExecutionMode | null | undefined): boolean {
  if (!mode) return false
  return mode !== "live"
}

/**
 * Whether the given effective mode should record-and-extract only (skip AI entirely).
 */
/**
 * @description 判断是否captureonly
 * @param mode - 模式
 * @returns boolean
 */
export function isCaptureOnly(mode: ExecutionMode | null | undefined): boolean {
  return mode === "capture_only"
}
