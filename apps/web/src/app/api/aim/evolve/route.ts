import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { aimEvolveBodySchema } from "@/features/aim/contracts/api"
import { prisma } from "@/lib/prisma"
import {
  extractAimEvolutionSuggestions,
  normalizeEvolutionMessages,
} from "@/lib/aim-chat-evolution"
import { persistAimMemories } from "@/lib/aim-memory"

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonBody(request, aimEvolveBodySchema, { maxBytes: 256 * 1024 })
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const agentId = typeof body.agentId === "string" ? body.agentId : ""
    const shouldPersist = body.persist === true
    const messages = normalizeEvolutionMessages(body.messages)

    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }
    if (messages.length < 2) {
      return NextResponse.json({ suggestions: [] })
    }

    const project = await prisma.clientProject.findFirst({
      where: { id: projectId, userId: user.id, status: "active" },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ error: "IP营销全案不存在或已归档" }, { status: 404 })
    }

    const suggestions = await extractAimEvolutionSuggestions({
      messages,
      maxSuggestions: 5,
    })

    // 可选：把偏好建议沉淀为 AimMemory（kind=preference），不破坏现有返回
    if (shouldPersist && agentId && suggestions.length > 0) {
      await persistAimMemories(
        suggestions.map((s) => ({ kind: "preference" as const, content: `${s.title}：${s.content}` })),
        { userId: user.id, projectId, agentId },
      ).catch(() => {})
    }

    return NextResponse.json({ suggestions })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/evolve] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "偏好提炼失败" },
      { status: 500 },
    )
  }
}
