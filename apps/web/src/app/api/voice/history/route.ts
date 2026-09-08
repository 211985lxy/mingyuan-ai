import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseQuery } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

/**
 * GET /api/voice/history
 * 当前用户的语音合成历史（元数据，不含音频本体），倒序分页。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request, { requireActivation: false })
    if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 })

    const { page = 1, pageSize = 20 } = parseQuery(request, historyQuerySchema)
    const [items, total] = await Promise.all([
      prisma.voiceSynthesisRecord.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          model: true,
          voiceId: true,
          format: true,
          textPreview: true,
          charCount: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.voiceSynthesisRecord.count({ where: { userId: user.id } }),
    ])

    return NextResponse.json({
      data: {
        items,
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[api/voice/history] 读取失败:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "配音历史暂时不可用，请稍后重试" }, { status: 500 })
  }
}
