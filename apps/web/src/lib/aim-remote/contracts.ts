/**
 * AIM Remote Invocation contracts — single source of truth for the remote
 * capability surface (MCP tools + REST invocations).
 *
 * This module defines:
 * - The set of action scopes a key may be granted.
 * - The remote invocation status machine.
 * - Structured error codes shared by REST + MCP.
 * - The request/response shapes for draft submission + invocation polling.
 *
 * No runtime logic here — pure constants + types so REST routes, MCP tools,
 * the background task executor, and tests all reference one definition.
 */

import type { ContentFormat } from "@/lib/aim-generator"
import type { AimAgentId } from "@/lib/aim-harness/contracts"

// ---------------------------------------------------------------------------
// Action scopes
// ---------------------------------------------------------------------------

/**
 * Fine-grained action scopes granted to an AgentApiKey.
 *
 * `allowedScopes` on a key is an array of these strings. When
 * AGENT_API_SCOPES_ENFORCED is enabled, every remote endpoint asserts the
 * required scope; an empty scope list is fail-closed. When the flag is off,
 * scope is ignored and legacy keys keep full backward-compatible access.
 */
export const AGENT_SCOPE = {
  capabilitiesRead: "capabilities.read",
  projectsRead: "projects.read",
  draftsSubmit: "drafts.submit",
  invocationsRead: "invocations.read",
  inspirationIngest: "inspiration.ingest",
  inspirationStatusRead: "inspiration.status.read",
  repliesClaim: "replies.claim",
  repliesAck: "replies.ack",
  knowledgePreview: "knowledge.preview",
  knowledgeConfirm: "knowledge.confirm",
} as const

export type AgentScope = (typeof AGENT_SCOPE)[keyof typeof AGENT_SCOPE]

/** All valid scope strings, for validation. */
export const AGENT_SCOPES: readonly string[] = Object.values(AGENT_SCOPE)

/** Default scope preset for a Codex-oriented key (read + draft generation + polling). */
export const CODEX_DEFAULT_SCOPES: AgentScope[] = [
  AGENT_SCOPE.capabilitiesRead,
  AGENT_SCOPE.projectsRead,
  AGENT_SCOPE.draftsSubmit,
  AGENT_SCOPE.invocationsRead,
]

/** Default scope preset for a WorkBuddy-oriented key (inspiration + reply delivery). */
export const WORKBUDDY_DEFAULT_SCOPES: AgentScope[] = [
  AGENT_SCOPE.inspirationIngest,
  AGENT_SCOPE.inspirationStatusRead,
  AGENT_SCOPE.repliesClaim,
  AGENT_SCOPE.repliesAck,
]

// ---------------------------------------------------------------------------
// Client type
// ---------------------------------------------------------------------------

export const AGENT_CLIENT_TYPES = ["codex", "workbuddy", "custom"] as const
export type AgentClientType = (typeof AGENT_CLIENT_TYPES)[number]

/** Resolve the default scope preset for a client type. */
export function defaultScopesForClientType(clientType: AgentClientType): AgentScope[] {
  if (clientType === "codex") return [...CODEX_DEFAULT_SCOPES]
  if (clientType === "workbuddy") return [...WORKBUDDY_DEFAULT_SCOPES]
  return []
}

// ---------------------------------------------------------------------------
// Invocation status machine
// ---------------------------------------------------------------------------

export const REMOTE_INVOCATION_STATUS = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
} as const

export type RemoteInvocationStatus = (typeof REMOTE_INVOCATION_STATUS)[keyof typeof REMOTE_INVOCATION_STATUS]

/** Statuses that are still in-flight (not yet final). */
export const ACTIVE_INVOCATION_STATUSES: ReadonlySet<string> = new Set([
  REMOTE_INVOCATION_STATUS.queued,
  REMOTE_INVOCATION_STATUS.running,
])

// ---------------------------------------------------------------------------
// Background task kind
// ---------------------------------------------------------------------------

/** Task kind for the remote generation background executor. */
export const AGENT_REMOTE_GENERATE_TASK_KIND = "agent.remote.generate"

// ---------------------------------------------------------------------------
// Structured error codes
// ---------------------------------------------------------------------------

/**
 * Structured error codes returned by the invocation surface.
 * REST maps these to HTTP statuses; MCP surfaces them in tool error results.
 */
export const REMOTE_ERROR_CODE = {
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  SCOPE_DENIED: "SCOPE_DENIED",
  KEY_DISABLED: "KEY_DISABLED",
  KEY_EXPIRED: "KEY_EXPIRED",
  INPUT_TOO_LARGE: "INPUT_TOO_LARGE",
  TOO_MANY_FORMATS: "TOO_MANY_FORMATS",
  INVALID_AGENT: "INVALID_AGENT",
  DAILY_TOKEN_EXCEEDED: "DAILY_TOKEN_EXCEEDED",
  MINUTE_LIMIT_EXCEEDED: "MINUTE_LIMIT_EXCEEDED",
  INVOCATION_NOT_FOUND: "INVOCATION_NOT_FOUND",
  INVOCATION_FORBIDDEN: "INVOCATION_FORBIDDEN",
  REMOTE_FEATURE_DISABLED: "REMOTE_FEATURE_DISABLED",
  EXECUTION_UNKNOWN: "EXECUTION_UNKNOWN",
} as const

export type RemoteErrorCode = (typeof REMOTE_ERROR_CODE)[keyof typeof REMOTE_ERROR_CODE]

/** Map a remote error code to an HTTP status. */
export function remoteErrorStatus(code: RemoteErrorCode): number {
  switch (code) {
    case REMOTE_ERROR_CODE.IDEMPOTENCY_CONFLICT:
      return 409
    case REMOTE_ERROR_CODE.SCOPE_DENIED:
    case REMOTE_ERROR_CODE.INVOCATION_FORBIDDEN:
      return 403
    case REMOTE_ERROR_CODE.KEY_DISABLED:
    case REMOTE_ERROR_CODE.KEY_EXPIRED:
      return 401
    case REMOTE_ERROR_CODE.INPUT_TOO_LARGE:
    case REMOTE_ERROR_CODE.TOO_MANY_FORMATS:
    case REMOTE_ERROR_CODE.INVALID_AGENT:
      return 400
    case REMOTE_ERROR_CODE.DAILY_TOKEN_EXCEEDED:
    case REMOTE_ERROR_CODE.MINUTE_LIMIT_EXCEEDED:
      return 429
    case REMOTE_ERROR_CODE.INVOCATION_NOT_FOUND:
      return 404
    case REMOTE_ERROR_CODE.REMOTE_FEATURE_DISABLED:
      return 503
    default:
      return 500
  }
}

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

export interface SubmitAgentInvocationInput {
  idempotencyKey: string
  projectId: string
  agentId: AimAgentId
  rawInput: string
  targetFormats: ContentFormat[]
  instruction?: string
  topicTitle?: string
  topicRationale?: string
}

export interface InvocationResultItem {
  format: ContentFormat
  content: string
}

export interface AgentInvocationResponse {
  invocationId: string
  status: RemoteInvocationStatus
  pollAfterSeconds: number
  runId?: string
  generationId?: string
  results?: InvocationResultItem[]
  provider?: string
  model?: string
  degraded?: boolean
  inputTokens?: number
  outputTokens?: number
  costCny?: number
  errorCode?: RemoteErrorCode
  errorMessage?: string
  warnings: ["draft_only"]
  requiresHumanReview: true
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const MIN_IDEMPOTENCY_KEY_LENGTH = 8
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128
export const MAX_RAW_INPUT_CHARS = 50_000
export const MAX_INSTRUCTION_CHARS = 5_000
export const MIN_TARGET_FORMATS = 1
export const MAX_TARGET_FORMATS = 3
export const DEFAULT_POLL_AFTER_SECONDS = 8
