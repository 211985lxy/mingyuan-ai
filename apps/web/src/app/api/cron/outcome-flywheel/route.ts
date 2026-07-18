import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import {
  evaluateOutcomes,
  createOutcomeEvaluatorStore,
} from "@/lib/aim/outcome-evaluator"
import {
  findDueOutcomeReminders,
  type OutcomeReminderStorePort,
} from "@/lib/aim/outcome-reminders"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 效果数据飞轮 cron（数据飞轮 D3）。
 *
 * 每日执行：
 *   1. 扫描所有有已发布内容的用户
 *   2. 对每个用户运行 outcome-evaluator（优秀文案→知识库回写）
 *   3. 对每个用户运行 outcome-reminders（到期未回填提醒）
 *
 * 注意：平台 API 自动拉取（抖音/小红书互动数据）需要平台开放 API 凭据，
 * 当前仅触发评估和提醒。手动录入走 /api/aim/history/[id]/outcome PUT 路由。
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // 1. 找出所有有已发布内容的用户
    const publishedUsers = await prisma.aimGeneration.findMany({
      where: {
        workflowStatus: "published",
        publishedAt: { not: null },
      },
      select: { userId: true },
      distinct: ["userId"],
      take: 200,
    })

    const evaluatorStore = createOutcomeEvaluatorStore(prisma)
    const reminderStore: OutcomeReminderStorePort = {
      aimGeneration: {
        findMany: (args) =>
          prisma.aimGeneration.findMany(args as Parameters<typeof prisma.aimGeneration.findMany>[0]),
      },
      contentOutcome: {
        findMany: (args) =>
          prisma.contentOutcome.findMany(args as Parameters<typeof prisma.contentOutcome.findMany>[0]),
      },
    }

    const summaries: Array<{
      userId: string
      evaluated: number
      excellent: number
      writtenBack: number
      reminders: number
      errors: string[]
    }> = []

    let totalEvaluated = 0
    let totalExcellent = 0
    let totalWrittenBack = 0
    let totalReminders = 0
    const allErrors: string[] = []

    for (const { userId } of publishedUsers) {
      try {
        // 2. 运行效果评估
        const evalResult = await evaluateOutcomes({
          userId,
          store: evaluatorStore,
        })

        // 3. 运行提醒检查
        const reminders = await findDueOutcomeReminders({
          userId,
          store: reminderStore,
        })

        totalEvaluated += evalResult.evaluated
        totalExcellent += evalResult.excellent
        totalWrittenBack += evalResult.writtenBack
        totalReminders += reminders.length

        if (evalResult.errors.length > 0) {
          allErrors.push(`[${userId}] ${evalResult.errors.join("; ")}`)
        }

        summaries.push({
          userId,
          evaluated: evalResult.evaluated,
          excellent: evalResult.excellent,
          writtenBack: evalResult.writtenBack,
          reminders: reminders.length,
          errors: evalResult.errors,
        })
      } catch (e) {
        allErrors.push(`[${userId}] unexpected: ${(e as Error).message}`)
      }
    }

    return NextResponse.json({
      ok: true,
      usersProcessed: publishedUsers.length,
      total: {
        evaluated: totalEvaluated,
        excellent: totalExcellent,
        writtenBack: totalWrittenBack,
        reminders: totalReminders,
      },
      errors: allErrors.slice(0, 20), // 最多返回 20 条错误
    })
  } catch (error) {
    console.error("[cron/outcome-flywheel] failed:", error)
    return NextResponse.json(
      { error: "效果数据飞轮执行失败" },
      { status: 503 },
    )
  }
}
