// ─── AIM 渠道生成后台任务执行器 ───────────────────────────
// 被 /api/cron/background-tasks 轮询调用（任务 kind = AIM_CHANNEL_GENERATE_TASK_KIND）。
// 流程：claim → 加载会话历史 → 调 generateAimContent → 按长度回复飞书 → 落库 assistant 消息 → complete/fail

import {
  claimBackgroundTask,
  completeBackgroundTask,
  failBackgroundTask,
  planBackgroundTaskFailure,
} from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"
import { generateAimContent } from "@/lib/aim-generator"
import { env } from "@/env"
import {
  getFeishuTenantAccessToken,
  replyFeishuTextMessage,
} from "@/lib/integrations/feishu-topic-chat"
import { planAimChannelReply } from "./aim-channel-reply"
import type { ContentFormat } from "@/lib/aim-generator"
import type { AimAgentId } from "@/lib/aim-harness/contracts"

export const AIM_CHANNEL_GENERATE_TASK_KIND = "aim_channel_generate"

/** 多轮对话保留的最近消息条数（user+assistant 交替，取最近 N 条）。 */
const MAX_HISTORY_MESSAGES = 10

/** 每个智能体的默认输出格式（决定 generateAimContent 的 targetFormats）。 */
const AGENT_DEFAULT_FORMAT: Partial<Record<AimAgentId, ContentFormat>> = {
  content_producer: "video_script",
  free_copywriter: "raw_copy",
  deep_copywriter: "raw_copy",
  business_system_diagnosis: "raw_copy",
  business_diagnosis: "raw_copy",
  content_review: "raw_copy",
  persona: "video_script",
}

export async function executeAimChannelGenerateBackgroundTask(taskId: string): Promise<boolean> {
  const task = await claimBackgroundTask(prisma, taskId)
  if (!task) return false

  try {
    await processAimChannelGenerate(task.aggregateId)
    await completeBackgroundTask(prisma, task.id, task.leaseToken!)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // 生成失败是可重试的（网络/限流）；落库失败提示后不再重试到死
    const retryable = !isUserFacingFailure(message)
    const plan = planBackgroundTaskFailure({
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable,
      now: new Date(),
    })

    if (plan.status === "failed") {
      await markMessageFailedAndNotify(task.aggregateId, message).catch(() => {})
    }

    await failBackgroundTask(prisma, {
      taskId: task.id,
      leaseToken: task.leaseToken!,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      retryable,
      error: message,
    })
    return true
  }
}

/** 用户输入类错误（空输入等）不应无限重试。 */
function isUserFacingFailure(message: string): boolean {
  return message.includes("输入") || message.includes("不能为空")
}

/**
 * 核心处理：加载会话 → 调 AIM → 回复飞书 → 落库。
 * aggregateId = AimConversationMessage.id（用户那条消息）。
 */
export async function processAimChannelGenerate(messageId: string): Promise<void> {
  const userMessage = await prisma.aimConversationMessage.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        select: { id: true, userId: true, projectId: true, platform: true, externalChatId: true, agentId: true },
      },
    },
  })
  if (!userMessage) return

  const conversation = userMessage.conversation
  const agentId = userMessage.agentId as AimAgentId
  const cleanedInput = userMessage.content.trim()

  if (!cleanedInput) {
    throw new Error("用户输入不能为空")
  }

  // 加载多轮历史（最近 N 条，不含当前这条）
  const history = await loadConversationHistory(conversation.id, messageId)

  // 调 AIM 生成（复用现有入口）。有历史时把历史拼到本轮输入前，使智能体感知多轮上下文。
  const targetFormat = AGENT_DEFAULT_FORMAT[agentId] || "raw_copy"
  const rawInput = history ? `${history}\n${cleanedInput}` : cleanedInput
  const result = await generateAimContent({
    userId: conversation.userId,
    projectId: conversation.projectId,
    agentId,
    rawInput,
    targetFormats: [targetFormat],
    existingGenerationId: undefined,
  })

  const generatedText = result.results[0]?.content?.trim() || ""
  const generationId = result.id

  // 决定回复形态
  const plan = planAimChannelReply({
    content: generatedText,
    generationId,
    webBaseUrl: env.NEXT_PUBLIC_APP_URL,
  })

  // 落库 assistant 消息 + 更新会话时间
  await prisma.aimConversationMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: generatedText,
      agentId,
      externalMessageId: userMessage.externalMessageId,
      aimGenerationId: generationId,
      resultSummary: plan.summary,
      status: "completed",
    },
  })
  await prisma.aimConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  })

  // 回复飞书（直接用底层发送，不走 Inspiration outbox）
  await sendAimChannelReply({
    platform: conversation.platform,
    externalMessageId: userMessage.externalMessageId,
    externalChatId: conversation.externalChatId,
    replyText: plan.replyText,
  })
}

/** 加载会话历史，按时间正序，拼成给 AIM 的 rawInput 上下文。 */
async function loadConversationHistory(conversationId: string, excludeMessageId: string): Promise<string> {
  const messages = await prisma.aimConversationMessage.findMany({
    where: { conversationId, id: { not: excludeMessageId } },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_MESSAGES,
    select: { role: true, content: true },
  })
  if (messages.length === 0) return ""

  // 倒序取的，反转回正序
  const ordered = messages.reverse()
  const lines = ordered.map((m) => {
    if (m.role === "user") return `用户：${m.content}`
    return `助手：${m.content}`
  })
  return ["【历史对话】", ...lines, "【本轮用户输入】"].join("\n")
}

/**
 * 发送回复到渠道。目前只实现飞书（线程内回复）。
 * 微信/企业微信等后续接入时在此扩展。
 */
async function sendAimChannelReply(input: {
  platform: string
  externalMessageId: string | null
  externalChatId: string
  replyText: string
}): Promise<void> {
  if (input.platform !== "feishu") {
    // 非飞书平台暂未接入，跳过（不阻断任务完成）
    return
  }
  if (!input.externalMessageId) return

  const appId = env.FEISHU_APP_ID
  const appSecret = env.FEISHU_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("飞书回复凭证未配置（FEISHU_APP_ID / FEISHU_APP_SECRET）")
  }

  const token = await getFeishuTenantAccessToken({ appId, appSecret })
  await replyFeishuTextMessage({
    messageId: input.externalMessageId,
    text: input.replyText,
    tenantAccessToken: token,
    idempotencyKey: `aim-channel-${input.externalMessageId}`,
  })
}

/** 生成彻底失败时：标记消息失败并发一条错误提示给用户。 */
async function markMessageFailedAndNotify(messageId: string, errorMessage: string): Promise<void> {
  const userMessage = await prisma.aimConversationMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      externalMessageId: true,
      conversationId: true,
      conversation: { select: { platform: true, externalChatId: true } },
    },
  })
  if (!userMessage) return

  await prisma.aimConversationMessage.update({
    where: { id: messageId },
    data: { status: "failed", errorMessage: errorMessage.slice(0, 1000) },
  })

  // 尝试通知用户（失败也不抛）
  await sendAimChannelReply({
    platform: userMessage.conversation.platform,
    externalMessageId: userMessage.externalMessageId,
    externalChatId: userMessage.conversation.externalChatId ?? "",
    replyText: "生成失败，请稍后重试，或换一种说法再发一次。",
  }).catch(() => {})
}
