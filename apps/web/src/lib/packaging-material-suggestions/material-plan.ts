import type { SearchPlanInput, SearchPlanResult } from "./contracts"
import { buildFallbackSearchPlan } from "./fallback-plan"
import { buildLlmSearchPlan } from "./llm-plan"

export { inferIndustryFromContent, resolveVisualArchetype } from "./industry"
export { clamp } from "./plan-utils"

export async function buildSearchPlan(input: SearchPlanInput): Promise<SearchPlanResult> {
  const fallback = buildFallbackSearchPlan(input);
  return buildLlmSearchPlan(input, fallback);
}
