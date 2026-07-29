import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { withAdminAuth } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"
import {
  GOVERNANCE_ROLES,
  GOVERNANCE_SCOPE_TYPES,
  isGovernanceRole,
} from "@/lib/aim/workflow-governance"
export const dynamic = "force-dynamic"
const SCOPE_SET = new Set<string>(GOVERNANCE_SCOPE_TYPES)
const LIST_DEFAULT = 50
const LIST_MAX = 200
const SCOPE_ID_MAX = 120
const INTERNAL_ID_MAX = 191
const EXTERNAL_ID_MAX = 120
function parseLimit(raw: string | null): number {
  const n = Number(raw ?? LIST_DEFAULT)
  if (!Number.isFinite(n) || n <= 0) return LIST_DEFAULT
  return Math.min(Math.floor(n), LIST_MAX)
}
function parseOffset(raw: string | null): number {
  const n = Number(raw ?? 0)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}
function isValidRoleScope(scopeType: string, role: string): boolean {
  return (
    (scopeType === "system" && role === "system_owner")
    || (scopeType === "workflow" && role !== "system_owner")
  )
}
interface GovernanceAssignmentDraft {
  scopeType: string
  scopeId: string
  role: string
  userId: string | null
  externalOpenId: string | null
  externalUserId: string | null
  status: "active" | "inactive"
  rawStatus: unknown
  effectiveAt: Date
}
function normalizeAssignmentDraft(
  body: Record<string, unknown>,
): GovernanceAssignmentDraft {
  return {
    scopeType: typeof body.scopeType === "string" ? body.scopeType : "",
    scopeId: typeof body.scopeId === "string" ? body.scopeId.trim() : "",
    role: typeof body.role === "string" ? body.role : "",
    userId: typeof body.userId === "string" ? body.userId.trim() || null : null,
    externalOpenId:
      typeof body.externalOpenId === "string" ? body.externalOpenId.trim() || null : null,
    externalUserId:
      typeof body.externalUserId === "string" ? body.externalUserId.trim() || null : null,
    status: body.status === "inactive" ? "inactive" : "active",
    rawStatus: body.status,
    effectiveAt:
      typeof body.effectiveAt === "string" && body.effectiveAt
        ? new Date(body.effectiveAt)
        : new Date(),
  }
}
function validateAssignmentDraft(draft: GovernanceAssignmentDraft): string | null {
  if (!SCOPE_SET.has(draft.scopeType)) return "scopeType 必须是 system 或 workflow"
  if (!draft.scopeId || draft.scopeId.length > SCOPE_ID_MAX) {
    return "scopeId 必须为 1-120 字符"
  }
  if (!isGovernanceRole(draft.role)) {
    return `role 必须是 ${GOVERNANCE_ROLES.join(" / ")}`
  }
  if (!isValidRoleScope(draft.scopeType, draft.role)) {
    return "system 仅允许 system_owner；工作流 Owner/审核人必须配置在 workflow scope"
  }
  if (
    draft.rawStatus !== undefined
    && draft.rawStatus !== "active"
    && draft.rawStatus !== "inactive"
  ) return "status 必须是 active 或 inactive"
  if (!draft.userId && !draft.externalOpenId && !draft.externalUserId) {
    return "userId、externalOpenId、externalUserId 至少填一个"
  }
  if (
    (draft.userId?.length ?? 0) > INTERNAL_ID_MAX
    || (draft.externalOpenId?.length ?? 0) > EXTERNAL_ID_MAX
    || (draft.externalUserId?.length ?? 0) > EXTERNAL_ID_MAX
  ) return "身份 ID 长度超限"
  if (!Number.isFinite(draft.effectiveAt.getTime())) return "effectiveAt 不是有效时间"
  return null
}
export const GET = withAdminAuth(async (request: NextRequest) => {
  const url = new URL(request.url)
  const scopeType = url.searchParams.get("scopeType")
  const scopeId = url.searchParams.get("scopeId")
  const status = url.searchParams.get("status")
  const limit = parseLimit(url.searchParams.get("limit"))
  const offset = parseOffset(url.searchParams.get("offset"))
  const where: Record<string, unknown> = {}
  if (scopeType) where.scopeType = scopeType
  if (scopeId) where.scopeId = scopeId
  if (status === "active" || status === "inactive") where.status = status
  const [items, total] = await Promise.all([
    prisma.governanceAssignment.findMany({
      where,
      orderBy: [{ scopeType: "asc" }, { scopeId: "asc" }, { role: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.governanceAssignment.count({ where }),
  ])
  return NextResponse.json({ items, total, limit, offset })
}, "admin")
export const POST = withAdminAuth(async (request: NextRequest, { admin }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const draft = normalizeAssignmentDraft(body)
  const validationError = validateAssignmentDraft(draft)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }
  const {
    scopeType,
    scopeId,
    role,
    userId,
    externalOpenId,
    externalUserId,
    status,
    effectiveAt,
  } = draft
  if (status === "active") {
    const conflict = await prisma.governanceAssignment.findFirst({
      where: { scopeType, scopeId, role, status: "active" },
      select: { id: true },
    })
    if (conflict) {
      return NextResponse.json(
        { error: "同一 scope/role 已有 active 配置，请先停用旧配置" },
        { status: 409 },
      )
    }
  }
  const created = await prisma.governanceAssignment.create({
    data: {
      scopeType,
      scopeId,
      role,
      userId,
      externalOpenId,
      externalUserId,
      status,
      effectiveAt,
    },
  })
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "governance_assignment.create",
    targetType: "governance_assignment",
    targetId: created.id,
    metadata: { scopeType, scopeId, role, status },
  })
  return NextResponse.json(
    { item: created },
    { status: 201, headers: { "x-request-id": requestId } },
  )
}, "admin")
/** 停用 / 重新启用 assignment */
export const PATCH = withAdminAuth(async (request: NextRequest, { admin }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const id = typeof body.id === "string" ? body.id.trim() : ""
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  if (body.status !== "active" && body.status !== "inactive") {
    return NextResponse.json({ error: "status 必须是 active 或 inactive" }, { status: 400 })
  }
  const existing = await prisma.governanceAssignment.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "配置不存在" }, { status: 404 })
  }
  if (!isValidRoleScope(existing.scopeType, existing.role)) {
    return NextResponse.json(
      { error: "历史配置的 role/scope 组合非法，拒绝重新启用" },
      { status: 400 },
    )
  }
  if (body.status === "active") {
    const conflict = await prisma.governanceAssignment.findFirst({
      where: {
        scopeType: existing.scopeType,
        scopeId: existing.scopeId,
        role: existing.role,
        status: "active",
        NOT: { id },
      },
      select: { id: true },
    })
    if (conflict) {
      return NextResponse.json(
        { error: "同一 scope/role 已有 active 配置，请先停用旧配置" },
        { status: 409 },
      )
    }
  }
  const updated = await prisma.governanceAssignment.update({
    where: { id },
    data: { status: body.status },
  })
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action:
      body.status === "inactive"
        ? "governance_assignment.deactivate"
        : "governance_assignment.activate",
    targetType: "governance_assignment",
    targetId: updated.id,
    metadata: {
      scopeType: updated.scopeType,
      scopeId: updated.scopeId,
      role: updated.role,
      status: updated.status,
    },
  })
  return NextResponse.json(
    { item: updated },
    { headers: { "x-request-id": requestId } },
  )
}, "admin")
