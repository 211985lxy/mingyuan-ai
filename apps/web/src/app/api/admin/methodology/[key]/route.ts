import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAdminOrEditor } from "@/lib/admin-auth"
import {
  METHODOLOGY_META,
  getMethodologyForAdmin,
  resetMethodologyToText,
  type MethodologyKey,
} from "@/lib/agent-methodology-store"
import { recordAdminAudit } from "@/lib/admin-audit"
import { validateHighRiskApproval } from "@/lib/aim/approval-validation"

const VALID_KEYS = new Set<MethodologyKey>(
  Object.keys(METHODOLOGY_META) as MethodologyKey[]
)

function isValidKey(key: string): key is MethodologyKey {
  return VALID_KEYS.has(key as MethodologyKey)
}

/** GET /api/admin/methodology/[key] —— 单份方法论详情 */
export const GET = withAdminOrEditor(async (_request: NextRequest, { params }) => {
  const key = params?.key
  if (!key || !isValidKey(key)) {
    return NextResponse.json({ error: "key 非法" }, { status: 400 })
  }
  const item = await getMethodologyForAdmin(key)
  return NextResponse.json({ data: item })
})

/** POST /api/admin/methodology/[key] —— 重置为文件原文（删除 DB 覆盖） */
export const POST = withAdminOrEditor(async (request: NextRequest, { admin, params }) => {
  const key = params?.key
  if (!key || !isValidKey(key)) {
    return NextResponse.json({ error: "key 非法" }, { status: 400 })
  }

  const body = await parseJsonBody(
    request,
    z.object({
      action: z.literal("reset"),
      workflowId: z.string().trim().min(1).max(120),
      approvalId: z.string().trim().min(1).max(191),
    }).strict(),
    { maxBytes: 2048 },
  )
  if (body?.action !== "reset") {
    return NextResponse.json({ error: "仅支持 action=reset" }, { status: 400 })
  }
  const gate = await validateHighRiskApproval({
    action: "publish",
    approvalId: body.approvalId,
    subjectType: "methodology",
    subjectId: `builtin:${key}`,
    workflowId: body.workflowId,
    projectId: null,
    expectedRoles: ["business_owner", "system_owner"],
    dualSign: true,
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 })

  await resetMethodologyToText(key)
  const item = await getMethodologyForAdmin(key)
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "methodology.reset",
    targetType: "methodology",
    targetId: key,
    metadata: { approvalId: gate.approvalId, workflowId: body.workflowId },
  })
  return NextResponse.json(
    { data: item, approvalId: gate.approvalId },
    { headers: { "x-request-id": requestId } },
  )
})
