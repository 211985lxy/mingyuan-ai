import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { getMethodologyProfileDetail } from "@/lib/methodology-profile-store"

/**
 * 读取单个命名方法论的详情（含最新 published 版本的 compiledPrompt / checksum）。
 * 校验 scope=user 归属；功能开关关闭或无权访问时返回 404。
 *
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @param params - 路由参数
 * @returns 无返回值
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const profile = await getMethodologyProfileDetail(id, user.id)
    if (!profile) {
      return NextResponse.json({ error: "方法论不存在或无权访问" }, { status: 404 })
    }
    return NextResponse.json(profile)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "命名方法论读取失败" },
      { status: 500 }
    )
  }
}
