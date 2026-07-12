export const META_MODEL = process.env.META_PROMPT_MODEL || "anthropic/claude-sonnet-4.6"
export const SCRIPT_MODEL = process.env.SCRIPT_GENERATION_MODEL || "openai/gpt-5.4"
export const SCORE_MODEL = process.env.SCORE_MODEL || "anthropic/claude-sonnet-4.6"
export const STEP_TIMEOUT_MS = 30_000
export const DEFAULT_MODEL = "rule-based-fallback"
