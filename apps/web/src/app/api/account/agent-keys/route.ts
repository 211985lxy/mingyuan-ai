import { NextRequest, NextResponse } from "next/server"

import { authErrorResponse, authenticateRequest } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
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
        dailyLimit: true,
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
        dailyLimit: key.dailyLimit,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      })),
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[account/agent-keys] Error:", error)
    return NextResponse.json({ error: "读取 Agent 绑定状态失败" }, { status: 500 })
  }
}
