import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { buildWorkflowBrief, parseWorkflowBriefRequest } from "@/lib/aim-workflow-brief"
import { aimWorkflowBriefBodySchema } from "@/features/aim/contracts/api"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonBody(request, aimWorkflowBriefBodySchema, { maxBytes: 32 * 1024 })
    const input = parseWorkflowBriefRequest(body)
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
