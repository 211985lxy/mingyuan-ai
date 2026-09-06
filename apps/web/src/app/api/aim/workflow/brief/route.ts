import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { buildWorkflowBrief, parseWorkflowBriefRequest } from "@/lib/aim-workflow-brief"
import { aimWorkflowBriefBodySchema } from "@/features/aim/contracts/api"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonBody(request, aimWorkflowBriefBodySchema, { maxBytes: 32 * 1024 })
    const input = parseWorkflowBriefRequest(body)
    if (!input) return NextResponse.json({ error: "工作流任务单参数无效" }, { status: 400 })
    const boundProject = await resolveBoundProject({
      userId: user.id,
      requestedProjectId: input.projectId,
    })
    const brief = await buildWorkflowBrief({ userId: user.id, ...input, projectId: boundProject.id })
    return NextResponse.json(brief)
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const message = error instanceof Error ? error.message : "任务单生成失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
