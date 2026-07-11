import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { buildWorkflowBrief, parseWorkflowBriefRequest } from "@/lib/aim-workflow-brief"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const input = parseWorkflowBriefRequest(await request.json())
    if (!input) return NextResponse.json({ error: "工作流任务单参数无效" }, { status: 400 })
    const brief = await buildWorkflowBrief({ userId: user.id, ...input })
    return NextResponse.json(brief)
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const message = error instanceof Error ? error.message : "任务单生成失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
