import { NextRequest, NextResponse } from "next/server"
import { agentAuthErrorResponse, authenticateAgentRequest } from "@/lib/agent-api-auth"
import { prisma } from "@/lib/prisma"
import { serializeInspirationEvent } from "@/features/topics/services/inspiration-events"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateAgentRequest(request)
    const { id } = await params
    const record = await prisma.inspiration.findFirst({
      where: { id, userId: context.userId, projectId: { in: context.allowedProjects } },
      select: {
        id: true,
        aiStatus: true,
        processingStage: true,
        source: true,
        sourceUrl: true,
        generatedTopics: true,
        knowledgeEntryId: true,
        topicSelectionId: true,
        errorMessage: true,
        replyErrorMessage: true,
        replyStatus: true,
        executionModeSnapshot: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!record) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
    return NextResponse.json(serializeInspirationEvent(record))
  } catch (error) {
    return agentAuthErrorResponse(error) ?? NextResponse.json({ error: "Inspiration event lookup failed" }, { status: 500 })
  }
}
