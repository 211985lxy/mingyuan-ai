import { NextRequest, NextResponse } from "next/server"
import { sourcesForEmail } from "@/lib/account-industry-sources"
import { loadEffectiveAccountSourceBindings } from "@/lib/hot-source-settings"
import { authenticateRequest } from "@/lib/user-auth"

export const runtime = "nodejs"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request, { requireActivation: false })
    const bindings = await loadEffectiveAccountSourceBindings()
    const sources = sourcesForEmail(bindings, user.email)

    return NextResponse.json({
      data: {
        accountEmail: user.email,
        sourceCount: sources.length,
        sources,
      },
    })
  } catch (error) {
    console.error("[account/hot-sources] failed:", error)
    return NextResponse.json({ error: "热点信源暂时不可用" }, { status: 401 })
  }
}
