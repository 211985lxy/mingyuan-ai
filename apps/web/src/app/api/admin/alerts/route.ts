import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { listOperationalAlerts } from "@/lib/operational-alerts"

export const dynamic = "force-dynamic"

export const GET = withAdminOnly(async (request: NextRequest) => {
  const params = new URL(request.url).searchParams
  const result = await listOperationalAlerts({
    status: (params.get("status") || undefined) as "open" | "acknowledged" | "resolved" | undefined,
    severity: (params.get("severity") || undefined) as "warning" | "error" | "critical" | undefined,
    limit: Number(params.get("limit") || "50"),
    cursor: params.get("cursor"),
  })
  return NextResponse.json(result)
})
