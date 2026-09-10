import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { transitionOperationalAlert } from "@/lib/operational-alerts"
import { parseJsonBody } from "@/lib/api-contract"

const transitionSchema = z.object({ transition: z.enum(["acknowledged", "resolved", "reopened"]) })

export const PATCH = withAdminOnly(async (request: NextRequest, { admin, params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "alert id is required" }, { status: 400 })
  let body: { transition: "acknowledged" | "resolved" | "reopened" }
  try {
    body = await parseJsonBody(request, transitionSchema)
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 })
  }
  const transition = body.transition
  const data = await transitionOperationalAlert({ id, transition, adminId: admin.id })
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: `alert.${transition}`,
    targetType: "operational_alert",
    targetId: id,
    metadata: { transition },
  })
  return NextResponse.json({ data }, { headers: { "x-request-id": requestId } })
})
