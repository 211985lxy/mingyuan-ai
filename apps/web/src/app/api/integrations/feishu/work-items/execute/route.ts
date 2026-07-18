/**
 * 单条经营事项执行入口（WP-4）。
 *
 * docs/plans/aim-ai-native-company-zcode-execution-plan.md §14：
 * 受保护的单记录状态执行入口，把 WP-3 执行服务绑定到飞书单记录读写能力。
 * 本包只做状态控制，不调用 AIM Harness 生成内容。
 *
 * 鉴权：Authorization: Bearer <AIM_WORK_ITEM_API_SECRET>，timingSafeEqual 防时序攻击。
 *       密钥未配置 → 503（fail-closed）；密钥错误/缺失 Bearer → 401。
 *
 * 请求体：{ recordId, action, aimResultId?, resultSummary?, resultLink?, errorMessage? }
 *   action ∈ start | submit_review | complete | fail
 *
 * 响应：
 *   200 成功（含幂等命中，idempotent:true）
 *   400 输入不合法（坏 JSON / 缺 recordId / 非法 action / 缺结果或错误必填项）
 *   401 未授权
 *   503 服务密钥或飞书配置缺失（fail-closed，不伪造）
 *   409 业务冲突（执行服务 ok:false：非法跳转、记录缺失、状态未知、缺结果ID），错误原样透传
 */
import { NextRequest, NextResponse } from "next/server"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { checkWorkItemApiSecret } from "@/lib/aim/work-item-api-auth"
import {
  createLarkWorkItemStore,
  readWorkItemStoreConfig,
} from "@/lib/aim/work-item-store"
import {
  completeWorkItem,
  failWorkItem,
  startWorkItem,
  submitWorkItemForReview,
  type WorkItemExecutionResult,
} from "@/lib/aim/services/work-item-execution"

export const dynamic = "force-dynamic"

const ACTIONS = new Set(["start", "submit_review", "complete", "fail"])

interface WorkItemRequestBody {
  recordId?: string
  action?: string
  aimResultId?: string
  resultSummary?: string
  resultLink?: string
  errorMessage?: string
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

function conflict(result: Extract<WorkItemExecutionResult, { ok: false }>) {
  return NextResponse.json({ ok: false, error: result.error }, { status: 409 })
}

export async function POST(request: NextRequest) {
  const auth = checkWorkItemApiSecret(request)
  if (auth === "unconfigured") {
    return NextResponse.json(
      { ok: false, error: "经营事项入口服务密钥未配置（AIM_WORK_ITEM_API_SECRET），fail-closed。" },
      { status: 503 },
    )
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let body: WorkItemRequestBody
  try {
    body = (await parseJsonRecord(request)) as WorkItemRequestBody
  } catch (error) {
    return apiRequestErrorResponse(request, error) ?? badRequest("请求体不是合法 JSON。")
  }

  const recordId = (body.recordId ?? "").trim()
  const action = (body.action ?? "").trim()
  if (!recordId) return badRequest("缺少 recordId。")
  if (!ACTIONS.has(action)) {
    return badRequest("缺少或非法的 action；必须为 start / submit_review / complete / fail 之一。")
  }

  // 各 action 必填输入校验；空值不进入服务，避免执行层伪造结果。
  if (action === "submit_review" && !(body.aimResultId ?? "").trim()) {
    return badRequest("submit_review 需要 aimResultId，禁止无结果提交审核。")
  }
  if (action === "complete" && !(body.aimResultId ?? "").trim()) {
    return badRequest("complete 需要 aimResultId，禁止无结果完成。")
  }
  if (action === "fail" && !(body.errorMessage ?? "").trim()) {
    return badRequest("fail 需要 errorMessage，禁止空错误。")
  }

  let config
  try {
    config = readWorkItemStoreConfig()
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "飞书配置缺失" },
      { status: 503 },
    )
  }
  const store = createLarkWorkItemStore(config)

  let result: WorkItemExecutionResult
  switch (action) {
    case "start":
      result = await startWorkItem(store, recordId)
      break
    case "submit_review":
      result = await submitWorkItemForReview(store, recordId, {
        aimResultId: body.aimResultId!.trim(),
        resultSummary: body.resultSummary ?? "",
        resultLink: body.resultLink ?? "",
      })
      break
    case "complete":
      result = await completeWorkItem(store, recordId, {
        aimResultId: body.aimResultId!.trim(),
        resultSummary: body.resultSummary ?? "",
      })
      break
    case "fail":
      result = await failWorkItem(store, recordId, {
        errorMessage: body.errorMessage!.trim(),
      })
      break
    default:
      return badRequest("非法 action。")
  }

  if (!result.ok) return conflict(result)
  return NextResponse.json(result, { status: 200 })
}
