import { NextRequest, NextResponse } from "next/server"

import { authErrorResponse, authenticateRequest } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"

/**
 * @description 处理 POST 请求 — 停用或撤销指定 Key
 * @param request - 请求对象
 * @param params - 路由参数 { id }
 * @returns 无返回值
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const url = new URL(request.url)
    const action = url.searchParams.get("action") || "disable"
    const { id } = await params

    const key = await prisma.agentApiKey.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true, name: true },
    })
    if (!key) {
      return NextResponse.json({ error: "Key 不存在" }, { status: 404 })
    }

    if (action === "revoke") {
      // Hard revoke: immediately disabled (token lookup will 401 on next call).
      // We never delete the row — audit history (logs, invocations) must remain intact.
      await prisma.agentApiKey.update({ where: { id: key.id }, data: { status: "disabled" } })
      return NextResponse.json({ ok: true, status: "disabled", action: "revoke", name: key.name })
    }

    // Default: disable (same DB effect as revoke; semantically "pauseable" vs "emergency").
    if (key.status === "disabled") {
      return NextResponse.json({ ok: true, status: "disabled", action: "disable", name: key.name, alreadyDisabled: true })
    }
    await prisma.agentApiKey.update({ where: { id: key.id }, data: { status: "disabled" } })
    return NextResponse.json({ ok: true, status: "disabled", action: "disable", name: key.name })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[account/agent-keys/[id]] Error:", error)
    return NextResponse.json({ error: "停用 Key 失败" }, { status: 500 })
  }
}
