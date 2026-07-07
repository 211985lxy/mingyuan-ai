import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10))
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10))
    )
    const projectId = url.searchParams.get("projectId")
    const agentId = url.searchParams.get("agentId")

    const records = await prisma.aimGeneration.findMany({
      where: {
        userId: user.id,
        ...(projectId ? { projectId } : {}),
        ...(agentId ? { agentId } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json(records)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "AIM 历史读取失败" },
      { status: 500 }
    )
  }
}
