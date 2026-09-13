import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { runAccountWorksSyncWithPrisma } from "@/lib/aim/account-works-sync-store"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * 账号作品全量同步 cron（WP-A1）：绑定账号的全部作品（标题/数据/封面）进
 * AccountWorkAsset 投影，成为编导智能体的账号历史上下文。
 * 幂等：重复执行只更新数据字段，绝不覆盖逐字稿成果；单账号失败不阻断批次。
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const bindingId = new URL(request.url).searchParams.get("bindingId") ?? undefined
  const summary = await runAccountWorksSyncWithPrisma({ bindingId })
  return NextResponse.json(summary)
}
