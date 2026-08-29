import { env } from "@/env"
export const META_MODEL = env.META_PROMPT_MODEL || "anthropic/claude-sonnet-4.6"
export const SCRIPT_MODEL = env.SCRIPT_GENERATION_MODEL || "anthropic/claude-sonnet-4.6"
export const SCORE_MODEL = env.SCORE_MODEL || "anthropic/claude-sonnet-4.6"
export const STEP_TIMEOUT_MS = 30_000
export const DEFAULT_MODEL = "rule-based-fallback"
