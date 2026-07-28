/**
 * 单条经营事项执行入口（WP-4 + WP-2 责任链）。
 *
 * 鉴权：Authorization: Bearer <AIM_WORK_ITEM_API_SECRET>
 * api-inventory: auth=signed_integration
 *
 * WP-2：集成密钥只能 start / submit_review / fail；
 * complete 须由飞书卡片或带有效 approvalId 的人工通道完成，不得用集成密钥直通。
 */
import { NextRequest, NextResponse } from "next/server"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { checkWorkItemApiSecret } from "@/lib/aim/work-item-api-auth"
import {
  createLarkWorkItemStore,
  readWorkItemStoreConfig,
} from "@/lib/aim/work-item-store"
import {
  failWorkItem,
  startWorkItem,
  submitWorkItemForReview,
  type WorkItemExecutionResult,
} from "@/lib/aim/services/work-item-execution"
import { assertIntegrationKeyActionAllowed } from "@/lib/aim/workflow-governance"

export const dynamic = "force-dynamic"

const ACTIONS = new Set(["start", "submit_review", "complete", "fail"])

interface WorkItemRequestBody {
  recordId?: string
  action?: string
  aimResultId?: string
  resultSummary?: string
  resultLink?: string
  errorMessage?: string
  approvalId?: string
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

function conflict(result: Extract<WorkItemExecutionResult, { ok: false }>) {
  return NextResponse.json({ ok: false, error: result.error }, { status: 409 })
}

function forbidden(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 403 })
}

/**
 * @description 集成密钥经营事项执行；高风险 complete 被 fail closed
 */
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

  // WP-2：集成密钥不得 complete/publish/promote
  const gate = assertIntegrationKeyActionAllowed(action)
  if (!gate.ok) return forbidden(gate.error)

  if (action === "submit_review" && !(body.aimResultId ?? "").trim()) {
    return badRequest("submit_review 需要 aimResultId，禁止无结果提交审核。")
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
