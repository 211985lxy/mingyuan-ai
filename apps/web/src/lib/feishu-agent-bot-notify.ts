// ─── 多 Bot 执行结果推送 ─────────────────────────────────────
// 工作项状态变更时，根据工作流找到对应 bot，以该 bot 身份推送交互卡片。
// 复用现有 feishu-supervisor-notifier 的通知类型定义。
// 不新增状态机，仅在推送层增加 bot 身份路由。

import { resolveBotByWorkflowId, type FeishuAgentBotConfig } from "./feishu-agent-registry"
import { sendCardAsBot, sendToChatAsBot } from "./feishu-bot-identity"
import { buildWorkItemCard, type WorkItemCardInput } from "./feishu-agent-card"
import type { SupervisorNotification } from "@/lib/aim/feishu-supervisor-notifier"

/**
 * 以对应 bot 身份推送经营事项状态变更通知。
 * 如果找不到对应 bot 或未配置 supervisorChatId，静默跳过（不阻断主流程）。
 */
export async function pushWorkItemNotification(input: {
  workflowId: string
  cardInput: WorkItemCardInput
}): Promise<void> {
  const bot = resolveBotByWorkflowId(input.workflowId)
  if (!bot) return

  const chatId = bot.supervisorChatId
  if (!chatId) return

  try {
    const cardJson = buildWorkItemCard(bot, input.cardInput)
    await sendCardAsBot({
      bot,
      chatId,
      cardJson,
      idempotencyKey: `work-item-${input.cardInput.recordId}-${input.cardInput.cardType}`,
    })
  } catch (error) {
    // 推送失败不阻断主流程
    console.error(`[agent-bot-notify] push failed for ${input.cardInput.recordId}`, error)
  }
}

/**
 * 将现有 SupervisorNotification 转换为 bot 推送。
 * 用于在 work-item-dispatcher 中替代/补充现有的 sendFeishuSupervisorNotification。
 */
export async function pushSupervisorNotificationAsBot(input: {
  workflowId: string
  notification: SupervisorNotification
}): Promise<void> {
  const bot = resolveBotByWorkflowId(input.workflowId)
  if (!bot) return

  const chatId = bot.supervisorChatId
  if (!chatId) return

  const cardType = mapNotificationToCardType(input.notification.type)

  try {
    const cardJson = buildWorkItemCard(bot, {
      itemName: input.notification.summary,
      recordId: input.notification.recordId,
      workflowId: input.workflowId,
      cardType,
      summary: input.notification.nextAction,
      resultLink: input.notification.resultLink,
    })
    await sendCardAsBot({
      bot,
      chatId,
      cardJson,
      idempotencyKey: `supervisor-${input.notification.recordId}-${input.notification.type}`,
    })
  } catch (error) {
    console.error(`[agent-bot-notify] supervisor push failed for ${input.notification.recordId}`, error)
  }
}

/**
 * 以 bot 身份发送简单文本通知（用于非卡片场景）。
 */
export async function pushTextNotificationAsBot(input: {
  bot: FeishuAgentBotConfig
  chatId: string
  text: string
  idempotencyKey?: string
}): Promise<void> {
  try {
    await sendToChatAsBot({
      bot: input.bot,
      chatId: input.chatId,
      text: input.text,
      idempotencyKey: input.idempotencyKey,
    })
  } catch (error) {
    console.error("[agent-bot-notify] text push failed", error)
  }
}

function mapNotificationToCardType(type: SupervisorNotification["type"]): WorkItemCardInput["cardType"] {
  if (type === "review_required") return "review_required"
  if (type === "execution_timeout") return "failed"
  return "failed"
}
