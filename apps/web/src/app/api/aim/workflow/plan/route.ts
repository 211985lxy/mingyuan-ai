import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { generatePlanQuestions } from "@/lib/aim/plan-option-engine"
import { ownsActiveProject } from "@/lib/resource-ownership"
import type { PlanTaskSpec, PlanTaskSpecField } from "@/lib/aim/plan-types"
import { PLAN_MAX_ROUNDS, PLAN_MAX_TOTAL_QUESTIONS, PLAN_TASK_SPEC_FIELDS } from "@/lib/aim/plan-types"

/**
 * POST /api/aim/workflow/plan
 *
 * 无状态计划追问接口：接收 projectId、一句话需求、已确认字段和已回答字段，
 * 返回标准化任务单、最多 3 个必要问题、假设项和 ready 状态。
 * 最多补充一轮，总问题数不超过 6。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request) as Record<string, unknown>

    // ── 入参校验 ──
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const requirement = typeof body.requirement === "string" ? body.requirement.trim().slice(0, 1000) : ""
    if (!projectId) return NextResponse.json({ error: "请先选择 IP 营销全案" }, { status: 400 })
    if (!requirement) return NextResponse.json({ error: "请输入一句话需求" }, { status: 400 })

    // ── 项目权限校验 ──
    if (!await ownsActiveProject(user.id, projectId)) {
      return NextResponse.json({ error: "项目不存在或已归档" }, { status: 404 })
    }

    // ── 解析可选参数 ──
    const confirmedFields = sanitizeConfirmedFields(body.confirmedFields)
    const answeredQuestionIds = Array.isArray(body.answeredQuestionIds)
      ? Array.from(new Set((body.answeredQuestionIds as unknown[])
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)))
      : []
    const round = typeof body.round === "number" && Number.isInteger(body.round) && body.round >= 1
      ? Math.min(body.round, PLAN_MAX_ROUNDS)
      : 1
    // 不信任客户端自报的计数；以去重后的已回答问题 ID 为准并封顶。
    const totalQuestionsAsked = Math.min(answeredQuestionIds.length, PLAN_MAX_TOTAL_QUESTIONS)

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
      { error: "计划生成失败，请稍后重试" },
      { status: 500 },
    )
  }
}

function sanitizeConfirmedFields(value: unknown): Partial<PlanTaskSpec> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const fields: Partial<PlanTaskSpec> = {}
  for (const field of PLAN_TASK_SPEC_FIELDS) {
    const raw = input[field]
    if (typeof raw !== "string") continue
    const text = raw.trim().slice(0, 1000)
    if (text) fields[field as PlanTaskSpecField] = text
  }
  return fields
}
