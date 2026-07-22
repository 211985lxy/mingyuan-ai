/**
 * MCP authentication bridge.
 *
 * mcp-handler's `withMcpAuth` calls `verifyToken(req, bearerToken)` and expects
 * an AuthInfo object (or undefined to reject). We reuse the existing
 * `authenticateAgentToken` so MCP and REST share identical key validation.
 *
 * The returned AuthInfo carries the apiKeyId so that tool handlers can rebuild
 * the full AgentApiContext (scopes, projects, agents) once per request.
 */

import { authenticateAgentToken, buildAgentApiContext, type AgentApiContext } from "@/lib/agent-api-auth"
import { prisma } from "@/lib/prisma"

/**
 * AuthInfo attached to request.auth by mcp-handler.
 *
 * Implements the MCP AuthInfo contract (token/clientId/scopes) while carrying
 * the apiKeyId so tool handlers can rebuild the full AgentApiContext.
 */
export interface AimMcpAuthInfo {
  /** The raw bearer token (required by AuthInfo contract). */
  token: string
  /** Client identifier (the apiKeyId). */
  clientId: string
  /** Scopes attached to this token (mirrors the key's allowedScopes). */
  scopes: string[]
  /** Marker so we can distinguish our auth shape. */
  __aim: true
  /** The resolved apiKeyId (same as clientId; kept for clarity). */
  apiKeyId: string
}

function extractBearer(request: Request): string | undefined {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return undefined
  return auth.slice(7).trim() || undefined
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

/**
 * verifyToken hook for mcp-handler's withMcpAuth.
 * Returns AuthInfo when the bearer token is a valid active maim_ key, else undefined.
 */
export async function verifyMcpToken(request: Request, bearerToken?: string): Promise<AimMcpAuthInfo | undefined> {
  const token = bearerToken ?? extractBearer(request)
  if (!token) return undefined
  try {
    const apiKey = await authenticateAgentToken(token)
    return {
      token,
      clientId: apiKey.id,
      apiKeyId: apiKey.id,
      scopes: readStringArray(apiKey.allowedScopes),
      __aim: true,
    }
  } catch {
    return undefined
  }
}

/**
 * Load the full AgentApiContext from an apiKeyId (after MCP auth resolved it).
 * Re-derives projects/agents/scopes identically to authenticateAgentRequest.
 * Returns null when the key is no longer active or has expired.
 */
export async function loadContextForApiKey(apiKeyId: string): Promise<AgentApiContext | null> {
  const apiKey = await prisma.agentApiKey.findUnique({ where: { id: apiKeyId } })
  if (!apiKey || apiKey.status !== "active") return null
  if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) return null
  return buildAgentApiContext(apiKey)
}
