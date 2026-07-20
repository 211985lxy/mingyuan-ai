/**
 * AIM Thin Harness v1 — deterministic output validators.
 *
 * No LLM. These run on EVERY produced format (the plan requires deterministic
 * checks on all formats, plus an LLM report only on the main draft). They cover
 * empty content, length, format presence, banned words and AI-flavor signals.
 *
 * The main-draft LLM quality report is produced separately via the existing
 * quality-gate (runQualityCheck); this module is the deterministic layer.
 */

import { detectAITaste } from "@/lib/ai-taste-detector"
import type { ContentFormat } from "@/lib/aim-generator"

export interface FormatValidationResult {
  format: ContentFormat
  passed: boolean
  checks: Array<{ name: string; passed: boolean; detail?: string }>
}

export interface DeterministicValidationInput {
  format: ContentFormat
  content: string
  /** minimum char floor (sane default if unset) */
  minChars?: number
  /** banned substrings (e.g. AI self-disclosure) */
  bannedSubstrings?: string[]
  /** whether this format is the main publishable draft (runs AI-taste) */
  isMainDraft?: boolean
}

const DEFAULT_MIN_CHARS = 20

const AI_DISCLOSURE_BANS = [
  "我是一个AI",
  "作为一个AI",
  "根据我的数据库",
  "as an AI",
  "我是一个人工智能",
]

/**
 * @description 验证format
 * @param input - 输入数据
 * @returns FormatValidationResult
 */
export function validateFormat(input: DeterministicValidationInput): FormatValidationResult {
  const checks: FormatValidationResult["checks"] = []
  const minChars = input.minChars ?? DEFAULT_MIN_CHARS

  // 1. non-empty
  const trimmed = input.content.trim()
  checks.push({
    name: "non_empty",
    passed: trimmed.length > 0,
    detail: trimmed.length === 0 ? "empty content" : undefined,
  })

  // 2. length floor
  checks.push({
    name: "min_length",
    passed: trimmed.length >= minChars,
    detail: `len=${trimmed.length} min=${minChars}`,
  })

  // 3. banned substrings (AI self-disclosure + caller-supplied)
  const bans = [...AI_DISCLOSURE_BANS, ...(input.bannedSubstrings ?? [])]
  const hitBans = bans.filter((ban) => trimmed.includes(ban))
  checks.push({
    name: "no_banned_words",
    passed: hitBans.length === 0,
    detail: hitBans.length ? `hit=[${hitBans.join(",")}]` : undefined,
  })

  // 4. AI-taste (deterministic detector; only meaningful on prose drafts).
  //    Matches quality-gate: pass threshold is score >= 6.
  if (input.isMainDraft) {
    const aiTaste = detectAITaste(trimmed)
    const detected = aiTaste.score < 6
    const hitCount = aiTaste.forbiddenWordHits.length + aiTaste.patternHits.length
    checks.push({
      name: "ai_taste",
      passed: !detected,
      detail: detected ? `score=${aiTaste.score} hits=${hitCount}` : undefined,
    })
  }

  return {
    format: input.format,
    passed: checks.every((check) => check.passed),
    checks,
  }
}

/** Overall quality status derived from deterministic + (optional) LLM reports. */
/**
 * @description 派生qualitystatus
 * @param params - 参数对象
 * @returns "pass" | "warn" | "fail" | "skipped"
 */
export function deriveQualityStatus(params: {
  deterministic: FormatValidationResult[]
  llmOverallPassed?: boolean
  llmRan?: boolean
}): "pass" | "warn" | "fail" | "skipped" {
  const detFailed = params.deterministic.filter((result) => !result.passed)
  if (detFailed.length > 0) return "fail"
  if (params.llmRan === false) return "skipped"
  if (params.llmOverallPassed === false) return "warn"
  return "pass"
}
