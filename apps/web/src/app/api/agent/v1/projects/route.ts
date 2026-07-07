import { NextRequest, NextResponse } from "next/server"

import { agentAuthErrorResponse, authenticateAgentRequest } from "@/lib/agent-api-auth"
import { prisma } from "@/lib/prisma"

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
