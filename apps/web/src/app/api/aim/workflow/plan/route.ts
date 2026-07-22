import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { generatePlanQuestions } from "@/lib/aim/plan-option-engine"
import { ownsActiveProject } from "@/lib/resource-ownership"
import type { PlanRequest } from "@/lib/aim/plan-types"
import { PLAN_MAX_ROUNDS } from "@/lib/aim/plan-types"

/**
 * POST /api/aim/workflow/plan
 *
 * 无状态计划追问接口：接收 projectId、一句话需求、已确认字段和已回答字段，
 * 返回标准化任务单、最多 3 个必要问题、假设项和 ready 状态。
 * 最多补充一轮，总问题数不超过 5。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request) as Record<string, unknown>

    // ── 入参校验 ──
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const requirement = typeof body.requirement === "string" ? body.requirement.trim() : ""
    if (!projectId) return NextResponse.json({ error: "请先选择 IP 营销全案" }, { status: 400 })
    if (!requirement) return NextResponse.json({ error: "请输入一句话需求" }, { status: 400 })

    // ── 项目权限校验 ──
    if (!await ownsActiveProject(user.id, projectId)) {
      return NextResponse.json({ error: "项目不存在或已归档" }, { status: 404 })
    }

    // ── 解析可选参数 ──
    const confirmedFields = (body.confirmedFields && typeof body.confirmedFields === "object" && !Array.isArray(body.confirmedFields))
      ? body.confirmedFields as Partial<PlanRequest["confirmedFields"]>
      : {}
    const answeredQuestionIds = Array.isArray(body.answeredQuestionIds)
      ? (body.answeredQuestionIds as unknown[]).filter((id): id is string => typeof id === "string")
      : []
    const round = typeof body.round === "number" && body.round >= 1
      ? Math.min(body.round, PLAN_MAX_ROUNDS)
      : 1
    const totalQuestionsAsked = typeof body.totalQuestionsAsked === "number" && body.totalQuestionsAsked >= 0
      ? body.totalQuestionsAsked
      : answeredQuestionIds.length

    // ── 生成问题 ──
    const result = await generatePlanQuestions({
      projectId,
      userId: user.id,
      requirement,
      confirmedFields: confirmedFields ?? {},
      answeredQuestionIds,
      round,
      totalQuestionsAsked,
    })

    return NextResponse.json(result)
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse

    console.error("[aim/workflow/plan] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "计划生成失败" },
      { status: 500 },
    )
  }
}
