import { env } from "@/env"
export const LLM_PASS_SCORE = 5
export const SCORING_MODEL = env.PACKAGING_MATERIAL_PLAN_MODEL || "openai/gpt-5-mini"
