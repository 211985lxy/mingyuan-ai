/**
 * 经营结果判断码（WP-0）。
 * 决策只看 verdictCode；userVerdict / verdictNote 仅展示，禁止字符串包含判断。
 */

export const OUTCOME_VERDICT_CODES = [
  "excellent",
  "effective",
  "neutral",
  "ineffective",
  "failed",
] as const

export type OutcomeVerdictCode = (typeof OUTCOME_VERDICT_CODES)[number]

/** 读取/展示用：含历史无码记录的 unknown */
export type OutcomeVerdictCodeOrUnknown = OutcomeVerdictCode | "unknown"

export const OUTCOME_VERDICT_CODE_LABELS: Record<OutcomeVerdictCodeOrUnknown, string> = {
  excellent: "优秀",
  effective: "有效",
  neutral: "一般",
  ineffective: "无效",
  failed: "失败",
  unknown: "未知",
}

const CODE_SET = new Set<string>(OUTCOME_VERDICT_CODES)

export function isOutcomeVerdictCode(value: unknown): value is OutcomeVerdictCode {
  return typeof value === "string" && CODE_SET.has(value)
}

/**
 * 规范化写入值：合法码返回自身；非法/空返回 null（不猜测）。
 * 历史无码不在此回填，读取侧用 resolveOutcomeVerdictCode → unknown。
 */
export function parseOutcomeVerdictCode(value: unknown): OutcomeVerdictCode | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return isOutcomeVerdictCode(trimmed) ? trimmed : null
}

/** 读取侧：有合法码用码，否则 unknown（旧自由文本不得自动升级）。 */
export function resolveOutcomeVerdictCode(
  verdictCode: string | null | undefined,
): OutcomeVerdictCodeOrUnknown {
  return isOutcomeVerdictCode(verdictCode) ? verdictCode : "unknown"
}

export function isPositiveOutcomeVerdict(code: OutcomeVerdictCodeOrUnknown): boolean {
  return code === "excellent" || code === "effective"
}

export function isNegativeOutcomeVerdict(code: OutcomeVerdictCodeOrUnknown): boolean {
  return code === "ineffective" || code === "failed"
}
