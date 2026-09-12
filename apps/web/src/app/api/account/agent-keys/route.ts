import { NextRequest, NextResponse } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"

import { authErrorResponse, authenticateRequest } from "@/lib/user-auth"
import { parseJsonBody } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import {
  AGENT_CLIENT_TYPES,
  AGENT_SCOPES,
  defaultScopesForClientType,
  type AgentClientType,
} from "@/lib/aim-remote/contracts"
import {
  AccountProjectContextError,
  resolveBoundProject,
  type BoundProject,
} from "@/lib/account-project-context"
import { lockClientProjects, lockUsers } from "@/features/projects/services/project-row-lock"

export const AGENT_AGENT_ALLOWLIST: readonly string[] = Object.freeze([
  "business_system_diagnosis",
  "business_diagnosis",
  "content_producer",
  "free_copywriter",
  "work_editor",
  "content_review",
  "content_retro",
])

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  clientType: z.enum(AGENT_CLIENT_TYPES as unknown as [AgentClientType, ...AgentClientType[]]),
  // 项目由登录账号绑定关系决定；保留可选字段兼容旧客户端，但不再允许多项目 Key。
  projects: z.array(z.string().trim().min(1)).max(20).default([]),
  agents: z.array(z.string().trim().min(1)).max(10).default([...AGENT_AGENT_ALLOWLIST]),
  scopes: z.array(z.string()).optional(),
  dailyLimit: z.number().int().min(1).max(1000).default(50),
  minuteLimit: z.number().int().min(1).max(600).default(60),
  dailyTokenLimit: z.number().int().min(1).nullish(),
  maxInputChars: z.number().int().min(100).max(50000).default(50000),
  expiresAt: z.string().datetime().nullish(),
}).strict()

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

async function withLockedBoundProject<T>(
  userId: string,
  project: BoundProject,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await lockClientProjects(tx, [project.id])
    await lockUsers(tx, [userId])
    const lockedUser = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, boundProjectId: true },
    })
    if (!lockedUser) {
      throw new AccountProjectContextError("ACCOUNT_NOT_FOUND", "账号不存在", 404)
    }
    if (lockedUser.boundProjectId !== project.id) {
      throw new AccountProjectContextError(
        "ACCOUNT_BINDING_CHANGED",
        "账号项目绑定已变化，请重试",
      )
    }
    const lockedProject = await tx.clientProject.findUnique({
      where: { id: project.id },
      select: {
        id: true,
        status: true,
        userId: true,
        members: { where: { userId }, select: { userId: true } },
      },
    })
    if (
      !lockedProject ||
      lockedProject.status !== "active" ||
      (lockedProject.userId !== userId && lockedProject.members.length === 0)
    ) {
      throw new AccountProjectContextError(
        "BOUND_PROJECT_UNAVAILABLE",
        "账号绑定的项目不可用",
      )
    }
    return run(tx)
  })
}

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    await resolveBoundProject({ userId: user.id })
    const keys = await prisma.agentApiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        allowedProjects: true,
        allowedAgents: true,
        clientType: true,
        allowedScopes: true,
        dailyLimit: true,
        minuteLimit: true,
        dailyTokenLimit: true,
        maxInputChars: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      items: keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        status: key.status,
        allowedProjectCount: Array.isArray(key.allowedProjects) ? key.allowedProjects.length : 0,
        allowedAgents: Array.isArray(key.allowedAgents) ? key.allowedAgents : [],
        clientType: key.clientType,
        allowedScopes: Array.isArray(key.allowedScopes) ? key.allowedScopes : [],
        dailyLimit: key.dailyLimit,
        minuteLimit: key.minuteLimit,
        dailyTokenLimit: key.dailyTokenLimit,
        maxInputChars: key.maxInputChars,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      })),
    })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[account/agent-keys] Error:", error)
    return NextResponse.json({ error: "读取 Agent 绑定状态失败" }, { status: 500 })
  }
}

/**
 * @description 处理 POST 请求 — 创建专用 Key，明文仅返回一次
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonBody(request, createSchema)
    const requestedProjects = body.projects ?? []

    if (requestedProjects.length > 1) {
      return NextResponse.json({
        error: "一个 AIM 账号只能为绑定项目创建 API Key",
        code: "ACCOUNT_PROJECT_STATUS_LOCKED",
      }, { status: 409 })
    }
    const boundProject = await resolveBoundProject({
      userId: user.id,
      requestedProjectId: requestedProjects[0] || undefined,
    })

    // Validate agents (schema defaults to the allowlist when omitted)
    const agents = body.agents ?? AGENT_AGENT_ALLOWLIST
    const invalidAgents = agents.filter((a) => !AGENT_AGENT_ALLOWLIST.includes(a))
    if (invalidAgents.length > 0) {
      return NextResponse.json({ error: `不支持的智能体：${invalidAgents.join(", ")}` }, { status: 400 })
    }

    // Resolve scopes: explicit wins, else default preset by clientType
    let scopes: string[]
    if (body.scopes) {
      const invalid = body.scopes.filter((s) => !AGENT_SCOPES.includes(s))
      if (invalid.length > 0) {
        return NextResponse.json({ error: `不支持的 scope：${invalid.join(", ")}` }, { status: 400 })
      }
      scopes = body.scopes
    } else {
      scopes = defaultScopesForClientType(body.clientType)
    }

    const plainKey = `maim_${randomBytes(24).toString("base64url")}`
    const created = await withLockedBoundProject(user.id, boundProject, (tx) =>
      tx.agentApiKey.create({
        data: {
          userId: user.id,
          name: body.name,
          keyPrefix: plainKey.slice(0, 14),
          keyHash: hashKey(plainKey),
          allowedProjects: [boundProject.id],
          allowedAgents: agents,
          dailyLimit: body.dailyLimit,
          clientType: body.clientType,
          allowedScopes: scopes,
          minuteLimit: body.minuteLimit,
          dailyTokenLimit: body.dailyTokenLimit ?? null,
          maxInputChars: body.maxInputChars,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
        select: { id: true },
      }),
    )

    // Plaintext key returned exactly once — never persisted, never re-shown.
    return NextResponse.json({
      id: created.id,
      name: body.name,
      apiKey: plainKey,
      keyPrefix: plainKey.slice(0, 14),
      clientType: body.clientType,
      scopes,
      warning: "明文 Key 仅显示这一次，关闭后无法再次查看。",
    }, { status: 201 })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[account/agent-keys/create] Error:", error)
    return NextResponse.json({ error: "创建 API Key 失败" }, { status: 500 })
  }
}
