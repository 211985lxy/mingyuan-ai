import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { atomizeProjectKnowledge, countProjectAtoms } from "@/lib/aim/knowledge-atom-store"
import { recordAdminAudit } from "@/lib/admin-audit"

/**
 * api-inventory: domain=admin/knowledge kind=management orchestratable=false auth=admin_session input=bounded_json_object
 */
export const POST = withAdminOnly(async (request: NextRequest, { admin }) => {
  const body = await parseJsonRecord(request)
  const userId = typeof body.userId === "string" ? body.userId : ""
  const projectId = typeof body.projectId === "string" ? body.projectId : ""
  if (!userId || !projectId) {
    return NextResponse.json({ error: "需要 userId 和 projectId" }, { status: 400 })
  }
  const result = await atomizeProjectKnowledge({ userId, projectId })
  const atomCount = await countProjectAtoms(projectId)
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "knowledge_atoms.backfill",
    targetType: "client_project",
    targetId: projectId,
    metadata: result,
  })
  return NextResponse.json({ ...result, atomCount }, { headers: { "x-request-id": requestId } })
})
