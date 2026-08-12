import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import {
  createMethodologyProfileVersion,
  getMethodologyProfileAdminDetail,
  publishMethodologyProfileVersion,
  updateMethodologyProfileMeta,
} from "@/lib/methodology-profile-admin"
import { MethodologyProfileError } from "@/lib/methodology-profile-store"
import { validateHighRiskApproval } from "@/lib/aim/approval-validation"

function errorResponse(error: unknown) {
  if (error instanceof MethodologyProfileError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  throw error
}

/** 方法论发布：有效 approvalId + business_owner/system_owner 双签 */
async function requirePublishApproval(
  approvalId: unknown,
  subjectId: string,
  workflowId: unknown,
) {
  const normalizedWorkflowId =
    typeof workflowId === "string" ? workflowId.trim() : ""
  if (!normalizedWorkflowId) {
    return { ok: false as const, error: "正式方法论变更缺少 workflowId。" }
  }
  return validateHighRiskApproval({
    action: "publish",
    approvalId: typeof approvalId === "string" ? approvalId : null,
    subjectType: "methodology",
    subjectId,
    workflowId: normalizedWorkflowId,
    projectId: null,
    expectedRoles: ["business_owner", "system_owner"],
    dualSign: true,
  })
}

/** GET /api/admin/methodology-profiles/[id] —— 详情 + 全部版本。 */
export const GET = withAdminOrEditor(async (_request, { params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  const detail = await getMethodologyProfileAdminDetail(id)
  if (!detail) return NextResponse.json({ error: "方法论不存在" }, { status: 404 })
  return NextResponse.json({ data: detail })
})

/** PATCH /api/admin/methodology-profiles/[id] —— 更新元信息（名称/别名/状态等）。 */
export const PATCH = withAdminOrEditor(async (request: NextRequest, { admin, params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  try {
    const body = await parseJsonRecord(request)
    const gate = await requirePublishApproval(body.approvalId, id, body.workflowId)
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 })
    const updated = await updateMethodologyProfileMeta(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      originatorName:
        body.originatorName === null
          ? null
          : typeof body.originatorName === "string"
            ? body.originatorName
            : undefined,
      aliases: Array.isArray(body.aliases)
        ? body.aliases.filter((a): a is string => typeof a === "string")
        : undefined,
      description:
        body.description === null
          ? null
          : typeof body.description === "string"
            ? body.description
            : undefined,
      applicableAgents: Array.isArray(body.applicableAgents)
        ? body.applicableAgents.filter((a): a is string => typeof a === "string")
        : undefined,
      applicableTasks: Array.isArray(body.applicableTasks)
        ? body.applicableTasks.filter((a): a is string => typeof a === "string")
        : undefined,
      priority: typeof body.priority === "number" ? body.priority : undefined,
      status: body.status === "active" || body.status === "archived" ? body.status : undefined,
    })
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "methodology_profile.update",
      targetType: "methodology",
      targetId: id,
      metadata: { approvalId: gate.approvalId, workflowId: body.workflowId },
    })
    return NextResponse.json(
      { data: updated, approvalId: gate.approvalId },
      { headers: { "x-request-id": requestId } },
    )
  } catch (error) {
    return errorResponse(error)
  }
})

/** POST /api/admin/methodology-profiles/[id] —— 新建版本。
 * body: { compiledPrompt, contentMarkdown?, status?: "draft"|"published", action?: "publish_version", versionId? }
 * action=publish_version + versionId：把已有 draft 发布。
 */
export const POST = withAdminOrEditor(async (request: NextRequest, { admin, params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  try {
    const body = await parseJsonRecord(request)
    if (body.action === "publish_version") {
      const versionId = typeof body.versionId === "string" ? body.versionId : ""
      if (!versionId) return NextResponse.json({ error: "缺少 versionId" }, { status: 400 })
      const gate = await requirePublishApproval(
        body.approvalId,
        versionId,
        body.workflowId,
      )
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 })
      const published = await publishMethodologyProfileVersion(versionId)
      const requestId = await recordAdminAudit({
        request,
        adminId: admin.id,
        action: "methodology_profile_version.publish",
        targetType: "methodology",
        targetId: versionId,
        metadata: { approvalId: gate.approvalId, workflowId: body.workflowId },
      })
      return NextResponse.json(
        { data: published, approvalId: gate.approvalId },
        { headers: { "x-request-id": requestId } },
      )
    }

    const compiledPrompt = typeof body.compiledPrompt === "string" ? body.compiledPrompt : ""
    if (!compiledPrompt.trim()) {
      return NextResponse.json({ error: "compiledPrompt 不能为空" }, { status: 400 })
    }
    const status = body.status === "draft" ? "draft" : "published"
    let publishApprovalId: string | null = null
    if (status === "published") {
      const gate = await requirePublishApproval(body.approvalId, id, body.workflowId)
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 })
      publishApprovalId = gate.approvalId
    }
    const created = await createMethodologyProfileVersion({
      profileId: id,
      compiledPrompt,
      contentMarkdown: typeof body.contentMarkdown === "string" ? body.contentMarkdown : undefined,
      status,
    })
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action:
        status === "published"
          ? "methodology_profile_version.publish"
          : "methodology_profile_version.create_draft",
      targetType: "methodology",
      targetId: created.id,
      metadata: {
        profileId: id,
        workflowId: body.workflowId ?? null,
        approvalId: publishApprovalId,
      },
    })
    return NextResponse.json(
      { data: created, approvalId: publishApprovalId },
      { headers: { "x-request-id": requestId } },
    )
  } catch (error) {
    return errorResponse(error)
  }
})
