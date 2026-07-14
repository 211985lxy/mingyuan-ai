import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseQuery } from "@/lib/api-contract"
import { aimHistoryQuerySchema } from "@/features/aim/contracts/api"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const { page = 1, pageSize = 20, projectId, agentId } = parseQuery(
      request,
      aimHistoryQuerySchema,
    )

    // content_producer 查询时同时包含旧 ip_video 记录
    const resolvedAgentFilter = agentId === "content_producer"
      ? { agentId: { in: ["content_producer", "ip_video"] as string[] } }
      : agentId ? { agentId } : {}

    const records = await prisma.aimGeneration.findMany({
      where: {
        userId: user.id,
        ...(projectId ? { projectId } : {}),
        ...resolvedAgentFilter,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    // 归一化：旧 ip_video 记录的 agentId 统一为 content_producer
    const normalized = records.map((record) => ({
      ...record,
      agentId: record.agentId === "ip_video" ? "content_producer" : record.agentId,
    }))

    return NextResponse.json(normalized)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "AIM 历史读取失败" },
      { status: 500 }
    )
  }
}
