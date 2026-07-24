import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { approveAimMemoryCandidate, rejectAimMemoryCandidate } from "@/lib/aim-memory"

export const dynamic = "force-dynamic"

/**
 * 人工审核记忆候选（14 周正本阶段 4）。
 * 请求体：{ "action": "approve" | "reject" }
 * 批准后 status=active 才可进入生产召回。
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
