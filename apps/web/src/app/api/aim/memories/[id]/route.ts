import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { approveAimMemoryCandidate, rejectAimMemoryCandidate } from "@/lib/aim-memory"
import { assertValidApprovalForHighRisk } from "@/lib/aim/workflow-governance"
import { createPrismaApprovalDecisionStore } from "@/lib/aim/approval-decision-prisma"
import { loadApprovalForSubject } from "@/lib/aim/approval-decision-store"

export const dynamic = "force-dynamic"

/**
 * 人工审核记忆候选（14 周正本阶段 4 / WP-2）。
 * 请求体：{ "action": "approve" | "reject", "approvalId"?: string }
 * 批准（正式晋升）必须引用有效 approvalId；拒绝不要求。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    let body: Record<string, unknown>
    try {
      body = await parseJsonRecord(request)
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 })
    }

    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ error: "action 必须是 approve 或 reject" }, { status: 400 })
    }

    if (body.action === "approve") {
      const store = createPrismaApprovalDecisionStore()
      const approvalId = typeof body.approvalId === "string" ? body.approvalId : null
      const approval = await loadApprovalForSubject(store, approvalId, "memory", id)
      const gate = assertValidApprovalForHighRisk({
        action: "promote",
        approval,
        subjectType: "memory",
        subjectId: id,
      })
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: 403 })
      }
    }

    const ok =
      body.action === "approve"
        ? await approveAimMemoryCandidate({ id, userId: user.id, reviewerId: user.id })
        : await rejectAimMemoryCandidate({ id, userId: user.id, reviewerId: user.id })

    if (!ok) {
      return NextResponse.json(
        { error: "候选不存在、无权操作或已非 candidate 状态" },
        { status: 404 },
      )
    }

    return NextResponse.json({
      id,
      action: body.action,
      status: body.action === "approve" ? "active" : "rejected",
    })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
