import { NextRequest, NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { listDouyinBindings } from "@/features/integrations/douyin-binding"

export const runtime = "nodejs"

/** GET /api/integrations/douyin/accounts — 当前用户已绑定的抖音账号（安全视图，不含 token） */
export async function GET(request: NextRequest, segmentData: { params: Promise<Record<string, string>> }) {
  return withUserAuth(async (_req, { user }) => {
    const items = await listDouyinBindings(user.id)
    return NextResponse.json({ items })
  })(request, segmentData)
}
