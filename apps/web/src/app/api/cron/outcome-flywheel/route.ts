import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import {
  evaluateOutcomes,
  createOutcomeEvaluatorStore,
} from "@/lib/aim/outcome-evaluator"
import {
  findDueOutcomeReminders,
  formatOutcomeReminderDigest,
  type OutcomeReminderStorePort,
} from "@/lib/aim/outcome-reminders"
import {
  readSupervisorNotificationConfig,
  sendFeishuSupervisorNotification,
} from "@/lib/aim/feishu-supervisor-notifier"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 效果数据飞轮 cron（数据飞轮 D3 / 阶段 4）。
 *
 * 每日执行：
 *   1. 扫描所有有已发布内容的用户
 *   2. 对每个用户运行 outcome-evaluator（优秀结果 → pending AssetCandidate，不直写 KnowledgeEntry）
 *   3. 对每个用户运行 outcome-reminders（发布后第 7 / 14 / 30 天到期未回填提醒）
 *
 * 注意：平台 API 自动拉取（抖音/小红书互动数据）需要平台开放 API 凭据，
 * 当前仅触发评估和提醒。手动录入走 /api/aim/history/[id]/outcome PUT 路由。
 */
/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
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
        findMany: (args) => {
          const input = args ?? {}
          return prisma.aimGeneration.findMany({
            where: input.where as never,
            take: input.take ?? 500,
          })
        },
      },
      contentOutcome: {
        findMany: (args) => {
          const input = args ?? {}
          return prisma.contentOutcome.findMany({
            where: input.where as never,
            take: input.take ?? 2_000,
          })
        },
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

        // 4. 若监督通知已启用，把到期回填提醒推到飞书监督群（复用现有 notifier，不新建通道）
        if (reminders.length > 0) {
          try {
            const notifyConfig = readSupervisorNotificationConfig()
            if (notifyConfig.enabled) {
              await sendFeishuSupervisorNotification({
                config: notifyConfig,
                notification: {
                  type: "human_judgment",
                  recordId: `outcome-reminders:${userId}`,
                  loopId: "outcome-flywheel",
                  summary: formatOutcomeReminderDigest(reminders),
                  nextAction: "打开 AiM 对该内容填写复盘 / 7·14·30 天结果回填",
                },
              })
            }
          } catch (notifyError) {
            allErrors.push(
              `[${userId}] reminder notify: ${(notifyError as Error).message}`,
            )
          }
        }

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
