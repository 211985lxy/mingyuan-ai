import { NextRequest, NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { refreshDouyinBinding, removeDouyinBinding } from "@/features/integrations/douyin-binding"

export const runtime = "nodejs"

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status })
}

/** POST /api/integrations/douyin/accounts/:id — 用存储 token 免扫码刷新资料 */
export async function POST(request: NextRequest, segmentData: { params: Promise<Record<string, string>> }) {
  return withUserAuth(async (_req, { user, params }) => {
    const id = params?.id ?? ""
    const result = await refreshDouyinBinding(user.id, id)
    if (!result.ok) {
      if (result.reason === "not_found") return errorResponse("NOT_FOUND", "绑定不存在", 404)
      if (result.reason === "refresh_failed") {
        return errorResponse("TOKEN_EXPIRED", "抖音授权已过期，请重新扫码绑定", 410)
      }
      return errorResponse("PROFILE_FAILED", "抖音资料读取失败，请稍后重试", 502)
    }
    return NextResponse.json({ profile: result.profile })
  })(request, segmentData)
}

/** DELETE /api/integrations/douyin/accounts/:id — 解绑 */
export async function DELETE(request: NextRequest, segmentData: { params: Promise<Record<string, string>> }) {
  return withUserAuth(async (_req, { user, params }) => {
    const id = params?.id ?? ""
    const removed = await removeDouyinBinding(user.id, id)
    if (!removed) return errorResponse("NOT_FOUND", "绑定不存在", 404)
    return NextResponse.json({ ok: true })
  })(request, segmentData)
}
