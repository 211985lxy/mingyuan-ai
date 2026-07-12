import { SAFE_AI_MATERIAL_ROLES, splitMaterialAssignments } from "@/lib/packaging-materials"
import type { SafeRole, SearchPlanInput, SearchPlanResult } from "./contracts"
import { distributeCounts } from "./plan-utils"
import { resolveVisualArchetype } from "./industry"

export function getPreferredMediaType(role: SafeRole): "image" | "video" {
  return role === "process" ? "video" : "image";
}

export function getFallbackQuery(
  role: SafeRole,
  input: Pick<SearchPlanInput, "industry" | "primaryOffer">,
): string {
  const archetype = resolveVisualArchetype(input.industry, input.primaryOffer);
  const suffix = {
    product_detail: "detail close-up",
    store_environment: "workplace interior",
    process: "professional work",
  }[role];
  return `${archetype} ${suffix}`;
}

export function buildFallbackSearchPlan(input: SearchPlanInput): SearchPlanResult {
  const { manual } = splitMaterialAssignments(input.existingItems);
  const occupiedRoles = new Set(
    manual
      .map((item) => item.role.trim())
      .filter((role): role is SafeRole => SAFE_AI_MATERIAL_ROLES.includes(role as SafeRole)),
  );
  const availableRoles = SAFE_AI_MATERIAL_ROLES.filter((role) => !occupiedRoles.has(role));
  const preferredRoles = new Set(input.preferredRoles ?? []);
  const chosenRoles = (availableRoles.length > 0 ? availableRoles : SAFE_AI_MATERIAL_ROLES)
    .slice()
    .sort((left, right) => Number(preferredRoles.has(right)) - Number(preferredRoles.has(left)));

  return {
    source: "deterministic",
    queries: distributeCounts(chosenRoles, input.maxCount).map(({ role, count }) => ({
      role,
      mediaType: getPreferredMediaType(role),
      count,
      query: getFallbackQuery(role, input),
    })),
  };
}
