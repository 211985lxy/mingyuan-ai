import { NextRequest, NextResponse } from "next/server"
import { generateAndStoreAiHotBriefing } from "@/lib/aihot-briefing"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request)
    const briefing = await generateAndStoreAiHotBriefing()
    return NextResponse.json({ data: briefing })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error("[aihot-briefing/refresh] failed:", error)
    return NextResponse.json(
      { error: "AI HOT 简报刷新失败，请稍后重试" },
      { status: 502 }
    )
  }
}
