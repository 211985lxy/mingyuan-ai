import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { listMethodologyProfilesForAdmin } from "@/lib/methodology-profile-admin"

/** GET /api/admin/methodology-profiles —— 命名方法论列表（含归档）。 */
export const GET = withAdminAuth(async () => {
  const items = await listMethodologyProfilesForAdmin()
  return NextResponse.json({ data: items })
})
