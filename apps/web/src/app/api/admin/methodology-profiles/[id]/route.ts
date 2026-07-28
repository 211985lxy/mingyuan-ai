import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { withAdminAuth } from "@/lib/admin-auth"
import {
  createMethodologyProfileVersion,
  getMethodologyProfileAdminDetail,
  publishMethodologyProfileVersion,
  updateMethodologyProfileMeta,
} from "@/lib/methodology-profile-admin"
import { MethodologyProfileError } from "@/lib/methodology-profile-store"
import { assertValidApprovalForHighRisk } from "@/lib/aim/workflow-governance"
import { createPrismaApprovalDecisionStore } from "@/lib/aim/approval-decision-prisma"
import { loadApprovalForSubject } from "@/lib/aim/approval-decision-store"

function errorResponse(error: unknown) {
  if (error instanceof MethodologyProfileError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  throw error
}

async function requirePublishApproval(approvalId: unknown, subjectId: string) {
  const store = createPrismaApprovalDecisionStore()
  const approval = await loadApprovalForSubject(
    store,
    typeof approvalId === "string" ? approvalId : null,
    "methodology",
    subjectId,
  )
  return assertValidApprovalForHighRisk({
    action: "publish",
    approval,
    subjectType: "methodology",
    subjectId,
  })
}

/** GET /api/admin/methodology-profiles/[id] —— 详情 + 全部版本。 */
export const GET = withAdminAuth(async (_request, { params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  const detail = await getMethodologyProfileAdminDetail(id)
  if (!detail) return NextResponse.json({ error: "方法论不存在" }, { status: 404 })
  return NextResponse.json({ data: detail })
})

/** PATCH /api/admin/methodology-profiles/[id] —— 更新元信息（名称/别名/状态等）。 */
export const PATCH = withAdminAuth(async (request: NextRequest, { params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  try {
    const body = await parseJsonRecord(request)
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
    return NextResponse.json({ data: updated })
  } catch (error) {
    return errorResponse(error)
  }
})

/** POST /api/admin/methodology-profiles/[id] —— 新建版本。
 * body: { compiledPrompt, contentMarkdown?, status?: "draft"|"published", action?: "publish_version", versionId? }
 * action=publish_version + versionId：把已有 draft 发布。
 */
export const POST = withAdminAuth(async (request: NextRequest, { params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  try {
    const body = await parseJsonRecord(request)
    if (body.action === "publish_version") {
      const versionId = typeof body.versionId === "string" ? body.versionId : ""
      if (!versionId) return NextResponse.json({ error: "缺少 versionId" }, { status: 400 })
      const gate = await requirePublishApproval(body.approvalId, versionId)
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 })
      const published = await publishMethodologyProfileVersion(versionId)
      return NextResponse.json({ data: published, approvalId: gate.approvalId })
    }

    const compiledPrompt = typeof body.compiledPrompt === "string" ? body.compiledPrompt : ""
    if (!compiledPrompt.trim()) {
      return NextResponse.json({ error: "compiledPrompt 不能为空" }, { status: 400 })
    }
    const status = body.status === "draft" ? "draft" : "published"
    if (status === "published") {
      const gate = await requirePublishApproval(body.approvalId, id)
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 403 })
    }
    const created = await createMethodologyProfileVersion({
      profileId: id,
      compiledPrompt,
      contentMarkdown: typeof body.contentMarkdown === "string" ? body.contentMarkdown : undefined,
      status,
    })
    return NextResponse.json({ data: created })
  } catch (error) {
    return errorResponse(error)
  }
})
