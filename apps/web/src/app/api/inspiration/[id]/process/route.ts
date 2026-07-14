import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { processInspiration } from "@/features/topics/services/process-inspiration"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    const result = await processInspiration(id, user.id)
    return NextResponse.json({ ok: true, ...result, message: "AI 处理已完成" })
  } catch (error) {
    if (error instanceof Error && error.message === "灵感正在处理中，请稍后") {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof Error && error.message === "灵感记录不存在") {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "AI 处理启动失败" },
      { status: 500 }
    )
  }
}
