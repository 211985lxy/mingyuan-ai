import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { validateHighRiskApproval } from "@/lib/aim/approval-validation"
import {
  METHODOLOGY_META,
  listMethodologiesForAdmin,
  updateMethodologyContent,
  type MethodologyKey,
} from "@/lib/agent-methodology-store"

const VALID_KEYS = new Set<MethodologyKey>(
  Object.keys(METHODOLOGY_META) as MethodologyKey[]
)

/** GET /api/admin/methodology —— 列出全部方法论（含内容、来源、更新时间） */
export const GET = withAdminOrEditor(async () => {
  const items = await listMethodologiesForAdmin()
  return NextResponse.json({ data: items })
})

/** PUT /api/admin/methodology —— 更新某份方法论内容（写 DB + 失效缓存） */
export const PUT = withAdminOrEditor(async (request: NextRequest, { admin }) => {
  const body = await parseJsonRecord(request)
  const key = body?.key as string
  const content = body?.content as string
  const workflowId = typeof body.workflowId === "string" ? body.workflowId.trim() : ""
  const approvalId = typeof body.approvalId === "string" ? body.approvalId : null

  if (!key || !VALID_KEYS.has(key as MethodologyKey)) {
    return NextResponse.json(
      { error: "key 非法，应为 ip_copywriting / business_diagnosis / event_storytelling" },
      { status: 400 }
    )
  }
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content 必须是字符串" }, { status: 400 })
  }
  if (!workflowId) {
    return NextResponse.json({ error: "正式方法论变更缺少 workflowId" }, { status: 400 })
  }
  const gate = await validateHighRiskApproval({
    action: "publish",
    approvalId,
    subjectType: "methodology",
    subjectId: `builtin:${key}`,
    workflowId,
    projectId: null,
    expectedRoles: ["business_owner", "system_owner"],
    dualSign: true,
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 })

  const row = await updateMethodologyContent(key as MethodologyKey, content, admin.id)
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "methodology.update",
    targetType: "methodology",
    targetId: key,
    metadata: { approvalId: gate.approvalId, workflowId },
  })
  return NextResponse.json(
    {
      data: {
        key: row.key,
        title: row.title,
        source: "db",
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
      },
      approvalId: gate.approvalId,
    },
    { headers: { "x-request-id": requestId } },
  )
})
