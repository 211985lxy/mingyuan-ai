import { prisma } from "@/lib/prisma"
import { sendTopicReviewToFeishu } from "@/lib/aim/feishu-topic-review-notify"
import { generateAndStoreTopicSelection } from "./topic-selection-generation"

/**
 * 「生成今日选题 → 推送人工裁决卡」的可复用编排。
 *
 * 每日推送 cron 与「换一批」后台任务共用这一条链路，避免出现第二套生成/推送实现。
 * 推送失败不回滚已落库的选题：候选仍可在控制台查看与采用。
 */

export interface DailyTopicPushInput {
  userId: string
  projectId: string
  requestId: string
  /** 「换一批」时传 1，让生成端知道这是重来（用于去重与策略） */
  refreshCount?: number
}

export type DailyTopicPushResult =
  | { ok: true; selectionId: string; pushed: boolean; pushReason?: string }
  | { ok: false; error: string }

/**
 * @description 生成一批当日选题并推送裁决卡到飞书
 * @param input - 用户、项目、请求 ID、是否换一批
 * @returns 记录 ID 与推送结果；生成失败返回错误文案
 */
export async function generateAndPushDailyTopics(
  input: DailyTopicPushInput,
): Promise<DailyTopicPushResult> {
  const result = await generateAndStoreTopicSelection({
    userId: input.userId,
    projectId: input.projectId,
    knowledgeEntryIds: [],
    recommendationMode: "daily",
    refreshCount: input.refreshCount ?? 0,
    requestId: input.requestId,
  })
  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  const project = await prisma.clientProject
    .findFirst({ where: { id: input.projectId }, select: { name: true } })
    .catch(() => null)

  let push: { sent: boolean; reason?: string } = { sent: false, reason: "推送未执行" }
  try {
    push = await sendTopicReviewToFeishu({
      selectionId: result.selectionId,
      cards: result.cards,
      sources: result.sourceHighlights,
      projectName: project?.name ?? null,
    })
  } catch (error) {
    console.error(`[${input.requestId}] 选题裁决卡推送失败:`, error)
    push = { sent: false, reason: error instanceof Error ? error.message : "推送异常" }
  }

  if (push.sent) {
    await prisma.topicSelection
      .update({ where: { id: result.selectionId }, data: { pushedAt: new Date() } })
      .catch(() => undefined)
  }

  return { ok: true, selectionId: result.selectionId, pushed: push.sent, pushReason: push.reason }
}
