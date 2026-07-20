import { NextRequest, NextResponse } from "next/server"

import { agentAuthErrorResponse, authenticateAgentRequest } from "@/lib/agent-api-auth"
import { prisma } from "@/lib/prisma"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateAgentRequest(request)

    const projects = await prisma.clientProject.findMany({
      where: {
        userId: context.userId,
        id: { in: context.allowedProjects },
        status: "active",
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        companyName: true,
        industry: true,
        targetCustomer: true,
        offer: true,
        deliveryGoal: true,
        status: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ projects })
  } catch (error) {
    const authResponse = agentAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[agent/projects] Error:", error)
    return NextResponse.json({ error: "Failed to read projects" }, { status: 500 })
  }
}
