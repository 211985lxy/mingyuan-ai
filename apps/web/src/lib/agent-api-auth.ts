import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { AGENT_AIM_AGENT_IDS } from "@/lib/agent-api-contract"
import { prisma } from "@/lib/prisma"
import { isValidAimAgent, normalizeAimAgentId, type AimAgentId } from "@/lib/aim-ui-config"

const KEY_PREFIX = "maim_"
const AGENT_AIM_AGENT_ID_SET = new Set<string>(AGENT_AIM_AGENT_IDS)

export type AgentApiContext = {
  apiKeyId: string
  userId: string
  allowedProjects: string[]
  allowedAgents: AimAgentId[]
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function extractBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  return auth.slice(7).trim()
}

/**
 * @description 认证 Agent API 请求，验证 Bearer Token 并检查日调用限额
 * @param request - Next.js 请求对象
 * @returns Agent API 上下文（Key ID、用户 ID、允许的项目和智能体列表）
 */
export async function authenticateAgentRequest(request: NextRequest): Promise<AgentApiContext> {
  const token = extractBearerToken(request)
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

  return {
    apiKeyId: apiKey.id,
    userId: apiKey.userId,
    allowedProjects: readStringArray(apiKey.allowedProjects),
    allowedAgents: readStringArray(apiKey.allowedAgents)
      .map((agent) => normalizeAimAgentId(agent))
      .filter(
        (agent): agent is AimAgentId => isValidAimAgent(agent) && AGENT_AIM_AGENT_ID_SET.has(agent)
      ),
  }
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
 * @description 将 Agent API 认证错误转换为对应的 HTTP 错误响应
 * @param error - 捕获的错误对象
 * @returns 对应的 NextResponse 错误响应，无法识别时返回 null
 */
export function agentAuthErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null
  const map: Record<string, { status: number; error: string }> = {
    AGENT_UNAUTHORIZED: { status: 401, error: "Missing agent API key" },
    AGENT_INVALID_KEY: { status: 401, error: "Invalid agent API key" },
    AGENT_DAILY_LIMIT: { status: 429, error: "Agent API daily limit exceeded" },
    AGENT_PROJECT_FORBIDDEN: { status: 403, error: "Project is not allowed for this API key" },
    AGENT_AGENT_FORBIDDEN: { status: 403, error: "Agent is not allowed for this API key" },
  }
  const item = map[error.message]
  return item ? NextResponse.json({ error: item.error }, { status: item.status }) : null
}
