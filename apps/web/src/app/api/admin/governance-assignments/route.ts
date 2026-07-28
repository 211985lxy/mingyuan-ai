/**
 * 治理责任配置 API（WP-2）
 * 录入 business_owner / system_owner / reviewer / backup_owner；写操作进 AdminAuditLog。
 */
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

export const GET = withAdminAuth(async (request: NextRequest) => {
  const url = new URL(request.url)
  const scopeType = url.searchParams.get("scopeType")
  const scopeId = url.searchParams.get("scopeId")
  const where: Record<string, unknown> = {}
  if (scopeType) where.scopeType = scopeType
  if (scopeId) where.scopeId = scopeId

  const items = await prisma.governanceAssignment.findMany({
    where,
    orderBy: [{ scopeType: "asc" }, { scopeId: "asc" }, { role: "asc" }],
    take: 500,
  })
  return NextResponse.json({ items })
}, "admin")

export const POST = withAdminAuth(async (request: NextRequest, { admin }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  const scopeType = typeof body.scopeType === "string" ? body.scopeType : ""
  const scopeId = typeof body.scopeId === "string" ? body.scopeId.trim() : ""
  const role = typeof body.role === "string" ? body.role : ""
  const userId = typeof body.userId === "string" ? body.userId.trim() : null
  const externalOpenId =
    typeof body.externalOpenId === "string" ? body.externalOpenId.trim() : null
  const status = body.status === "inactive" ? "inactive" : "active"

  if (!SCOPE_SET.has(scopeType)) {
    return NextResponse.json({ error: "scopeType 必须是 system 或 workflow" }, { status: 400 })
  }
  if (!scopeId) {
    return NextResponse.json({ error: "缺少 scopeId" }, { status: 400 })
  }
  if (!isGovernanceRole(role)) {
    return NextResponse.json(
      { error: `role 必须是 ${GOVERNANCE_ROLES.join(" / ")}` },
      { status: 400 },
    )
  }
  if (!userId && !externalOpenId) {
    return NextResponse.json({ error: "userId 与 externalOpenId 至少填一个" }, { status: 400 })
  }

  const created = await prisma.governanceAssignment.create({
    data: {
      scopeType,
      scopeId,
      role,
      userId,
      externalOpenId,
      status,
      effectiveAt:
        typeof body.effectiveAt === "string" && body.effectiveAt
          ? new Date(body.effectiveAt)
          : new Date(),
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
