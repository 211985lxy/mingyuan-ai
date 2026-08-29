import { env } from "@/env"
import { CROSS_GATEWAY_MODELS } from "@/lib/llm/models"
export const META_MODEL = env.META_PROMPT_MODEL || CROSS_GATEWAY_MODELS.claudeSonnet
export const SCRIPT_MODEL = env.SCRIPT_GENERATION_MODEL || CROSS_GATEWAY_MODELS.claudeSonnet
export const SCORE_MODEL = env.SCORE_MODEL || CROSS_GATEWAY_MODELS.claudeSonnet
export const STEP_TIMEOUT_MS = 30_000
export const DEFAULT_MODEL = "rule-based-fallback"
