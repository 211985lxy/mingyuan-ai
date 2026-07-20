import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { findDueOutcomeReminders } from "@/lib/aim/outcome-reminders"
import { prisma } from "@/lib/prisma"
import type { OutcomeReminderStorePort } from "@/lib/aim/outcome-reminders"

export const dynamic = "force-dynamic"

/**
 * 经营结果回填提醒（90 天计划 3.2）：
 * 返回当前用户已发布内容中，第 7 / 30 天窗口到期而未回填的提醒清单。
 * 只读接口；飞书提醒推送由自动化任务轮询本结果后决定。
 */
/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const reminders = await findDueOutcomeReminders({
      userId: user.id,
      store: prisma as unknown as OutcomeReminderStorePort,
    })
    return NextResponse.json({ reminders, generatedAt: new Date().toISOString() })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
