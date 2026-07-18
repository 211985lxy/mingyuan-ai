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

    // content_producer 查询时同时包含旧 ip_video 记录；
    // copywriter（文案创作官）查询时同时包含被合并的三张旧创作卡记录，
    // 记录本身 agentId 保持原值，点开时仍按原 agentId 走原 handler
    const resolvedAgentFilter = agentId === "copywriter"
      ? { agentId: { in: ["copywriter", "content_producer", "free_copywriter", "deep_copywriter", "ip_video"] as string[] } }
      : agentId === "content_producer"
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
