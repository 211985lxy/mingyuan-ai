import { normalizeAimAgentId } from "@/lib/aim-harness/contracts"

const UNIFIED_EXECUTE_AGENTS = new Set([
  "content_producer",
  "business_diagnosis",
  "business_system_diagnosis",
])

export function usesUnifiedAimExecuteEntry(agentId?: string | null) {
  return UNIFIED_EXECUTE_AGENTS.has(normalizeAimAgentId(agentId))
}

export function buildWebAttemptId(seed: string) {
  const hex = seed.replace(/[^a-fA-F0-9]/g, "").toLowerCase()
  return `web_${(hex + "0".repeat(24)).slice(0, 24)}`
}
