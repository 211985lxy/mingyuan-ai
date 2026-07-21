// ─── AIM 渠道消息接入服务 ─────────────────────────────────
// 从飞书 webhook 收到一条消息（已确认该绑定 routeTarget=aim）后：
// 解析意图 → 建会话 → 落库用户消息 → 入队后台生成任务 → 回"收到"。
// 与选题采集（inspiration-events）并存，由 binding.routeTarget 决定走哪条链路。

import { prisma } from "@/lib/prisma"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { resolveAimChannelIntent, buildAimChannelHelpText } from "@/lib/aim-channel-router"
import { AIM_CHANNEL_GENERATE_TASK_KIND } from "./aim-channel-generate-task"
import { AIM_CHANNEL_ACK_REPLY } from "./aim-channel-reply"
import type { AimAgentId } from "@/lib/aim-harness/contracts"

export interface AimChannelIngestInput {
  platform: string
  externalMessageId: string
  externalChatId: string
  externalSenderId?: string
  userId: string
  projectId: string
  /** 原始消息文本（含可能的 /命令前缀） */
  content: string
  /** 该绑定的默认智能体（ChannelBinding.defaultAgentId） */
  defaultAgentId?: string | null
}

export interface AimChannelIngestResult {
  /** accepted = 已入队生成；ignored = 未处理（如无法识别命令且无默认） */
  status: "accepted" | "ignored"
  /** 需要立即回复给用户的文本（accepted 时为"收到…"，ignored 时为帮助文案） */
  immediateReply?: string
  /** 是否需要调用方发送 immediateReply（飞书线程回复） */
  shouldReply: boolean
  /** 入队的消息 id（accepted 时有值） */
  messageId?: string
  reason?: string
}

/**
 * 处理一条 AIM 渠道消息。
 *
 * 幂等：以 dedupeKey = `${platform}:${externalMessageId}` 唯一约束防止飞书重试导致重复入队。
 */
export async function ingestAimChannelMessage(input: AimChannelIngestInput): Promise<AimChannelIngestResult> {
  const intent = resolveAimChannelIntent(input.content, input.defaultAgentId)

  // 无法确定智能体（无命令 + 无默认）→ 提示用户使用命令
  if (intent.via === "unknown" || !intent.agentId) {
    return {
      status: "ignored",
      immediateReply: buildAimChannelHelpText(),
      shouldReply: true,
      reason: "no_agent_resolved",
    }
  }

  const agentId = intent.agentId as AimAgentId
  const dedupeKey = `${input.platform}:${input.externalMessageId}`

  // 用户本轮实际输入为空（如只发了 "/内容创作" 没有内容）→ 提示补充
  if (!intent.cleanedInput) {
    return {
      status: "ignored",
      immediateReply: `已选择「${agentId}」，请接着发送你要处理的内容。`,
      shouldReply: true,
      reason: "empty_input",
    }
  }

  // 建会话（不存在则创建）+ 落库用户消息 + 入队，单事务保证一致性
  const result = await prisma.$transaction(async (tx) => {
    const conversation = await tx.aimConversation.upsert({
      where: {
        platform_externalChatId_agentId: {
          platform: input.platform,
          externalChatId: input.externalChatId,
          agentId,
        },
      },
      create: {
        userId: input.userId,
        projectId: input.projectId,
        platform: input.platform,
        externalChatId: input.externalChatId,
        agentId,
      },
      update: { lastMessageAt: new Date() },
      select: { id: true },
    })

    // 幂等落库用户消息：dedupeKey 冲突时说明已处理过
    let message
    try {
      message = await tx.aimConversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content: intent.cleanedInput,
          agentId,
          externalMessageId: input.externalMessageId,
          dedupeKey,
          status: "completed",
        },
        select: { id: true },
      })
    } catch {
      // dedupeKey 冲突 → 这条消息已处理过（飞书重试），忽略
      return { duplicate: true as const, messageId: null }
    }

    await enqueueBackgroundTask(tx as never, {
      kind: AIM_CHANNEL_GENERATE_TASK_KIND,
      aggregateType: "aim_conversation_message",
      aggregateId: message.id,
      idempotencyKey: `aim-channel-gen:${dedupeKey}`,
      maxAttempts: 4,
    })

    return { duplicate: false as const, messageId: message.id }
  })

  if (result.duplicate) {
    return { status: "ignored", shouldReply: false, reason: "duplicate" }
  }

  return {
    status: "accepted",
    immediateReply: AIM_CHANNEL_ACK_REPLY,
    shouldReply: true,
    messageId: result.messageId ?? undefined,
  }
}
