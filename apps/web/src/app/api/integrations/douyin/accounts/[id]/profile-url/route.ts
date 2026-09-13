import { NextRequest, NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { DouyinAdapter } from "@/lib/tikhub/adapters/douyin"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  isValidSecUserId,
  normalizeDouyinProfileUrl,
} from "@/lib/aim/douyin-profile-link"

export const runtime = "nodejs"
export const maxDuration = 30

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status })
}

/**
 * POST /api/integrations/douyin/accounts/:id/profile-url
 *
 * WP-A1：保存抖音主页链接并解析 sec_user_id。
 * 抖音开放平台的「授权账号作品列表」能力已下线（实测 28001056），作品数据改走
 * 第三方公开通道（TikHub 主 / 红狐备），二者都以 sec_user_id 定位账号，
 * 因此需要用户一次性提供主页链接。
 */
export async function POST(request: NextRequest, segmentData: { params: Promise<Record<string, string>> }) {
  return withUserAuth(async (req, { user, params }) => {
    const id = params?.id ?? ""
    const binding = await prisma.douyinAccountBinding.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!binding) return errorResponse("NOT_FOUND", "绑定不存在", 404)

    const body = await parseJsonRecord(req)
    const normalized = normalizeDouyinProfileUrl(body.profileUrl)
    if (!normalized.ok) return errorResponse("INVALID_URL", normalized.error, 400)

    let secUserId: string
    try {
      secUserId = await new DouyinAdapter().resolveUrl(normalized.url)
    } catch (error) {
      return errorResponse(
        "RESOLVE_FAILED",
        `无法从该链接解析出抖音账号：${error instanceof Error ? error.message : "解析失败"}`,
        422,
      )
    }
    if (!isValidSecUserId(secUserId)) {
      return errorResponse("RESOLVE_FAILED", "解析出的账号标识格式不正确，请重新复制主页链接", 422)
    }

    await prisma.douyinAccountBinding.update({
      where: { id: binding.id },
      data: { secUserId: secUserId.trim(), profileUrl: normalized.url },
    })

    return NextResponse.json({ ok: true, secUserId: secUserId.trim(), profileUrl: normalized.url })
  })(request, segmentData)
}
