import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseQuery } from "@/lib/api-contract"
import { aimHistoryQuerySchema } from "@/features/aim/contracts/api"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const { page = 1, pageSize = 20, projectId, agentId, scope, includeTotal } = parseQuery(
      request,
      aimHistoryQuerySchema,
    )

    // content_producer 查询时同时包含旧 ip_video 记录
    const resolvedAgentFilter = agentId === "content_producer"
      ? { agentId: { in: ["content_producer", "ip_video"] as string[] } }
      : agentId ? { agentId } : {}

    const where = {
      userId: user.id,
      ...(projectId ? { projectId } : {}),
      ...resolvedAgentFilter,
      ...(scope === "pending" ? {
        OR: [
          { workflowStatus: { notIn: ["published", "archived"] } },
          { workflowStatus: "published", retroSnapshots: { equals: [] } },
        ],
      } : {}),
    }
    const [records, total] = await Promise.all([
      prisma.aimGeneration.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      includeTotal === "true" ? prisma.aimGeneration.count({ where }) : Promise.resolve(0),
    ])

    // 归一化：旧 ip_video 记录的 agentId 统一为 content_producer
    const normalized = records.map((record) => ({
      ...record,
      agentId: record.agentId === "ip_video" ? "content_producer" : record.agentId,
    }))

    return NextResponse.json(includeTotal === "true" ? { items: normalized, total } : normalized)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "AIM 历史读取失败" },
      { status: 500 }
    )
  }
}
