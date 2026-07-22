/**
 * Feature flags for the AIM remote capability surface.
 *
 * All remote entry points (MCP route, invocation REST routes) gate on these
 * flags. When a flag is off, the corresponding surface returns 503 and does
 * not expose any capability — keeping the feature dark until explicit
 * rollout. The scope-enforcement flag additionally controls whether legacy
 * keys (empty allowedScopes) are granted backward-compatible full access.
 */

import { env } from "@/env"

/** Whether the MCP entry point (/api/aim-mcp/*) is live. Defaults off. */
export function isMcpEnabled(): boolean {
  return env.AIM_MCP_ENABLED === "true"
}

/** Whether the asynchronous invocation REST surface is live. Defaults off. */
export function isRemoteInvocationsEnabled(): boolean {
  return env.AIM_REMOTE_INVOCATIONS_ENABLED === "true"
}

/**
 * Whether action-scope enforcement is active.
 *
 * When enabled, every remote endpoint asserts its required scope and a key
 * with an empty allowedScopes list is fail-closed. When disabled, scope is
 * ignored so legacy keys retain their prior (project/agent-scoped) access.
 */
export function areScopesEnforced(): boolean {
  return env.AGENT_API_SCOPES_ENFORCED === "true"
}

/**
 * Allowed Host values for MCP requests.
 *
 * Derived from AIM_MCP_ALLOWED_HOSTS (comma-separated). When unset, defaults
 * to the production domain so the MCP surface is not reachable from
 * arbitrary hosts. Used to validate Host / X-Forwarded-Host headers.
 */
export function getAllowedMcpHosts(): string[] {
  const raw = env.AIM_MCP_ALLOWED_HOSTS
  if (!raw) return ["mingyuan-ai.cn"]
  return raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
}
