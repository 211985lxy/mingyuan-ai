import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { AGENT_AIM_AGENT_IDS } from "@/lib/agent-api-contract"
import { prisma } from "@/lib/prisma"
import { isValidAimAgent, normalizeAimAgentId, type AimAgentId } from "@/lib/aim-ui-config"
import { AGENT_CLIENT_TYPES, type AgentClientType, type AgentScope } from "@/lib/aim-remote/contracts"
import { areScopesEnforced } from "@/lib/aim-remote/feature-flags"

const KEY_PREFIX = "maim_"
const AGENT_AIM_AGENT_ID_SET = new Set<string>(AGENT_AIM_AGENT_IDS)

export type AgentApiContext = {
  apiKeyId: string
  userId: string
  allowedProjects: string[]
  allowedAgents: AimAgentId[]
  /** V2.1 remote: client type of this key (codex | workbuddy | custom). Null for legacy keys. */
  clientType: AgentClientType | null
  /** V2.1 remote: action scopes granted to this key. Empty array for legacy keys. */
  allowedScopes: AgentScope[]
  /** V2.1 remote: expiration timestamp, null = never expires. */
  expiresAt: Date | null
  /** V2.1 remote: per-message input character ceiling for draft submission. */
  maxInputChars: number
  /** V2.1 remote: per-minute request ceiling. */
  minuteLimit: number
  /** V2.1 remote: daily token budget ceiling, null = unlimited. */
  dailyTokenLimit: number | null
}

/**
 * @description 记录 Agent API 调用日志，同时更新 API Key 最后使用时间
 * @param input - 调用记录输入（上下文、操作名、状态、耗时等）
 * @returns 无返回值
 */
export async function recordAgentApiCall(input: {
  context: AgentApiContext
  action: string
  projectId?: string
  inputSummary?: string
  status: "success" | "failed"
  errorMessage?: string
  durationMs?: number
}) {
  await prisma.$transaction([
    prisma.agentApiKey.update({ where: { id: input.context.apiKeyId }, data: { lastUsedAt: new Date() } }),
    prisma.agentApiCallLog.create({
      data: {
        apiKeyId: input.context.apiKeyId,
        userId: input.context.userId,
        projectId: input.projectId || null,
        action: input.action,
        inputSummary: input.inputSummary?.slice(0, 500) || null,
        outputFormats: [],
        status: input.status,
        errorMessage: input.errorMessage || null,
        durationMs: input.durationMs ?? null,
      },
    }),
  ])
}

function hashAgentApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

/** Read a JSON value into a string[] (defensive against malformed JSON columns). */
export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function extractBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  return auth.slice(7).trim()
}

/**
 * Normalize a raw AgentApiKey row (which may predate the V2.1 remote columns)
 * into a fully-populated AgentApiContext. Missing columns fall back to
 * backward-compatible defaults so legacy keys keep working until scopes are
 * enforced. Exported so the MCP auth bridge can rebuild a context from an
 * apiKeyId after withMcpAuth resolved the token.
 */
export function buildAgentApiContext(apiKey: {
  id: string
  userId: string
  allowedProjects: unknown
  allowedAgents: unknown
  clientType: string | null
  allowedScopes: unknown
  minuteLimit: number | null
  dailyTokenLimit: number | null
  maxInputChars: number | null
  expiresAt: Date | null
}): AgentApiContext {
  const clientType = AGENT_CLIENT_TYPES.includes(apiKey.clientType as AgentClientType)
    ? (apiKey.clientType as AgentClientType)
    : null
  return {
    apiKeyId: apiKey.id,
    userId: apiKey.userId,
    allowedProjects: readStringArray(apiKey.allowedProjects),
    allowedAgents: readStringArray(apiKey.allowedAgents)
      .map((agent) => normalizeAimAgentId(agent))
      .filter(
        (agent): agent is AimAgentId => isValidAimAgent(agent) && AGENT_AIM_AGENT_ID_SET.has(agent)
      ),
    clientType,
    allowedScopes: readStringArray(apiKey.allowedScopes) as AgentScope[],
    expiresAt: apiKey.expiresAt,
    maxInputChars: apiKey.maxInputChars ?? 50_000,
    minuteLimit: apiKey.minuteLimit ?? 60,
    dailyTokenLimit: apiKey.dailyTokenLimit,
  }
}

/**
 * Verify a raw bearer token and return the active AgentApiKey row.
 *
 * Pure token validation — no rate limiting. Shared by both REST
 * (`authenticateAgentRequest`) and MCP (`withMcpAuth`'s verifyToken hook).
 * Throws AGENT_UNAUTHORIZED / AGENT_INVALID_KEY / KEY_EXPIRED.
 */
export async function authenticateAgentToken(token: string) {
  if (!token || !token.startsWith(KEY_PREFIX)) {
    throw new Error("AGENT_UNAUTHORIZED")
  }

  const keyHash = hashAgentApiKey(token)
  const apiKey = await prisma.agentApiKey.findUnique({
    where: { keyHash },
  })

  if (!apiKey || apiKey.status !== "active") {
    throw new Error("AGENT_INVALID_KEY")
  }

  if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
    throw new Error("KEY_EXPIRED")
  }

  return apiKey
}

/**
 * @description 认证 Agent API 请求，验证 Bearer Token 并检查日调用限额
 * @param request - Next.js 请求对象
 * @returns Agent API 上下文（Key ID、用户 ID、允许的项目和智能体列表）
 */
export async function authenticateAgentRequest(request: NextRequest): Promise<AgentApiContext> {
  const token = extractBearerToken(request)
  const apiKey = await authenticateAgentToken(token ?? "")

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const usedToday = await prisma.agentApiCallLog.count({
    where: {
      apiKeyId: apiKey.id,
      createdAt: { gte: today },
    },
  })

  if (usedToday >= apiKey.dailyLimit) {
    throw new Error("AGENT_DAILY_LIMIT")
  }

  return buildAgentApiContext(apiKey)
}

/**
 * @description 断言 Agent API 上下文有权访问指定项目
 * @param context - Agent API 上下文
 * @param projectId - 要访问的项目 ID
 * @returns 无返回值，无权时抛出错误
 */
export async function assertAgentProjectAccess(context: AgentApiContext, projectId: string) {
  if (!context.allowedProjects.includes(projectId)) {
    throw new Error("AGENT_PROJECT_FORBIDDEN")
  }

  const project = await prisma.clientProject.findFirst({
    where: { id: projectId, userId: context.userId, status: "active" },
    select: { id: true },
  })
  if (!project) throw new Error("AGENT_PROJECT_FORBIDDEN")
}

/**
 * @description 断言 Agent API 上下文有权访问指定智能体
 * @param context - Agent API 上下文
 * @param agentId - 要访问的智能体 ID
 * @returns 无返回值，无权时抛出错误
 */
export function assertAgentAccess(context: AgentApiContext, agentId: string): asserts agentId is AimAgentId {
  // 旧别名（ip_video）归一化为当前规范 id，兼容历史 API key 的 scope 与历史调用方
  const normalized = normalizeAimAgentId(agentId) as AimAgentId
  if (
    !isValidAimAgent(normalized)
    || !AGENT_AIM_AGENT_ID_SET.has(normalized)
    || !context.allowedAgents.includes(normalized)
  ) {
    throw new Error("AGENT_AGENT_FORBIDDEN")
  }
}

/**
 * Assert that the key has been granted the given action scope.
 *
 * When AGENT_API_SCOPES_ENFORCED is off, scope is ignored so legacy keys
 * (empty allowedScopes) retain full backward-compatible access. When on,
 * a missing scope throws SCOPE_DENIED (fail-closed).
 *
 * @param context - Agent API 上下文
 * @param scope - 需要的动作 scope
 */
export function assertAgentScope(context: AgentApiContext, scope: AgentScope): void {
  if (!areScopesEnforced()) return
  if (!context.allowedScopes.includes(scope)) {
    throw new Error("SCOPE_DENIED")
  }
}

/**
 * @description 将 Agent API 认证错误转换为对应的 HTTP 错误响应
 * @param error - 捕获的错误对象
 * @returns 对应的 NextResponse 错误响应，无法识别时返回 null
 */
export function agentAuthErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null
  const map: Record<string, { status: number; error: string }> = {
    AGENT_UNAUTHORIZED: { status: 401, error: "Missing agent API key" },
    AGENT_INVALID_KEY: { status: 401, error: "Invalid agent API key" },
    KEY_EXPIRED: { status: 401, error: "Agent API key has expired" },
    AGENT_DAILY_LIMIT: { status: 429, error: "Agent API daily limit exceeded" },
    AGENT_PROJECT_FORBIDDEN: { status: 403, error: "Project is not allowed for this API key" },
    AGENT_AGENT_FORBIDDEN: { status: 403, error: "Agent is not allowed for this API key" },
    SCOPE_DENIED: { status: 403, error: "This API key is not permitted to perform this action" },
  }
  const item = map[error.message]
  return item ? NextResponse.json({ error: item.error }, { status: item.status }) : null
}

