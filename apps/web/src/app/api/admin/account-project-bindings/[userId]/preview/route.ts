import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  AccountProjectContextError,
  createAccountProjectRepairToken,
  getAccountProjectRepairImpact,
} from "@/lib/account-project-context"
import { withAdminOnly } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

function contextErrorResponse(error: unknown) {
  if (!(error instanceof AccountProjectContextError)) return null
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status },
  )
}

function readProjectId(query: URLSearchParams): string {
  return (query.get("projectId") ?? "").trim()
}

/**
 * GET — read-only impact preview for a planned admin repair/recovery. Returns
 * only counts and project identity (current/target), NEVER body/content text.
 */
export const GET = withAdminOnly(async (request: NextRequest, { params }) => {
  try {
    const userId = (params?.userId ?? "").trim()
    if (!userId) {
      return NextResponse.json({ error: "userId 必填" }, { status: 400 })
    }
    const projectId = readProjectId(new URL(request.url).searchParams)
    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }
    const reactivate =
      new URL(request.url).searchParams.get("reactivate") === "1"

    const impact = await getAccountProjectRepairImpact(prisma, {
      userId,
      targetProjectId: projectId,
      reactivate,
    })
    return NextResponse.json({ impact })
  } catch (error) {
    return (
      contextErrorResponse(error) ??
      NextResponse.json({ error: "绑定修复预览失败" }, { status: 500 })
    )
  }
})

/**
 * POST — second-confirmation mint step. The admin has already reviewed the
 * impact and typed the reason; the route re-validates everything and issues the
 * short-lived confirmation token bound to { userId, previousProjectId, target
 * project, reactivation decision, reason }. Repair refuses to run without it.
 */
export const POST = withAdminOnly(async (request: NextRequest, { params }) => {
  try {
    const userId = (params?.userId ?? "").trim()
    if (!userId) {
      return NextResponse.json({ error: "userId 必填" }, { status: 400 })
    }
    const body = await parseJsonRecord(request)
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const reason = typeof body.reason === "string" ? body.reason.trim() : ""
    const reactivate = body.reactivate === true

    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: "请填写修复/恢复原因" }, { status: 400 })
    }

    const impact = await getAccountProjectRepairImpact(prisma, {
      userId,
      targetProjectId: projectId,
      reactivate,
    })

    const token = createAccountProjectRepairToken({
      userId,
      previousProjectId: impact.currentBinding?.id ?? null,
      projectId,
      reactivate,
      reason,
    })

    return NextResponse.json({ impact, token })
  } catch (error) {
    return (
      contextErrorResponse(error) ??
      NextResponse.json({ error: "生成确认信息失败" }, { status: 500 })
    )
  }
})
