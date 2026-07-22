import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { listMethodologyProfiles } from "@/lib/methodology-profile-store"
import { isNamedMethodologyEnabled } from "@/lib/methodology-profile-store"

/**
 * 列出当前用户可见的 active 命名方法论（全局 + 本人私有），含最新 published 版本号。
 * 供前端「参考方法论」选择器使用。功能开关关闭时返回空列表。
 *
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!isNamedMethodologyEnabled()) {
      return NextResponse.json([])
    }
    const profiles = await listMethodologyProfiles(user.id)
    return NextResponse.json(profiles)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "命名方法论列表读取失败" },
      { status: 500 }
    )
  }
}
