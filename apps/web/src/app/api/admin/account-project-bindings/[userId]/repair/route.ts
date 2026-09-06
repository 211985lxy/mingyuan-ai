import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  AccountProjectContextError,
  hashAccountProjectRepairReason,
  repairAccountProjectBinding,
  verifyAccountProjectRepairToken,
} from "@/lib/account-project-context"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"

function contextErrorResponse(error: unknown) {
  if (!(error instanceof AccountProjectContextError)) return null
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status },
  )
}

/**
 * POST — atomically execute an audited repair/recovery after a valid two-step
 * confirmation. The HMAC token (minted by the preview POST) must be present and
 * must still match the body reason, the path userId and the current binding.
 */
export const POST = withAdminOnly(async (request: NextRequest, { admin, params }) => {
  try {
    const userId = (params?.userId ?? "").trim()
    if (!userId) {
      return NextResponse.json({ error: "userId 必填" }, { status: 400 })
    }

    const body = await parseJsonRecord(request)
    const token = typeof body.token === "string" ? body.token.trim() : ""
    const reason = typeof body.reason === "string" ? body.reason.trim() : ""

    if (!reason) {
      return NextResponse.json({ error: "请填写修复/恢复原因" }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json(
        { error: "缺少确认信息，请先预览并二次确认", code: "REPAIR_TOKEN_REQUIRED" },
        { status: 400 },
      )
    }

    const payload = verifyAccountProjectRepairToken(token)
    if (!payload || payload.userId !== userId) {
      return NextResponse.json(
        { error: "确认信息无效或已过期，请重新预览确认", code: "REPAIR_TOKEN_INVALID" },
        { status: 403 },
      )
    }
    if (payload.reasonHash !== hashAccountProjectRepairReason(reason)) {
      return NextResponse.json(
        { error: "原因与确认信息不一致，请重新生成确认", code: "REPAIR_CONFIRMATION_MISMATCH" },
        { status: 409 },
      )
    }

    const result = await repairAccountProjectBinding({
      userId,
      previousProjectId: payload.previousProjectId,
      nextProjectId: payload.projectId,
      reactivateNext: payload.reactivate,
    })

    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "account_project.repair",
      targetType: "user",
      targetId: userId,
      metadata: {
        previousProjectId: result.previousProjectId,
        nextProjectId: result.nextProjectId,
        reason,
        reactivate: payload.reactivate,
        failedInvocationCount: result.failedInvocationCount,
        cancelledTaskCount: result.cancelledTaskCount,
        unattributedHistoryCount: result.unattributedHistoryCount,
      },
    })

    return NextResponse.json(
      { data: result },
      { headers: { "x-request-id": requestId } },
    )
  } catch (error) {
    return (
      contextErrorResponse(error) ??
      NextResponse.json({ error: "账号项目修复失败" }, { status: 500 })
    )
  }
})
