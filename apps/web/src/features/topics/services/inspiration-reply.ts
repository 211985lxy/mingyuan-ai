/**
 * Legacy reply helpers — DEPRECATED.
 *
 * Only `buildInspirationReplyText` and `INSPIRATION_ACCEPTED_REPLY` are still used
 * (by `topic-chat-service.ts` and `feishu/events/route.ts` respectively).
 * All claim/ack/execute logic has been replaced by `reply-outbox.ts`.
 *
 * @deprecated Use reply-outbox.ts for all new reply logic.
 */

import { env } from "@/env"

function topicCards(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is { title?: string; hook?: string; rationale?: string } => Boolean(item && typeof item === "object")) : []
}

/**
 * @description 构建inspirationreplytext
 * @param input - 输入数据
 * @returns 无返回值
 */
export function buildInspirationReplyText(input: { generatedTopics: unknown; topicSelectionId: string | null; errorMessage?: string | null }) {
  if (input.errorMessage) return `这次收录没有完成：${input.errorMessage}\n请检查链接后重试。`
  const cards = topicCards(input.generatedTopics)
  const first = cards[0]
  const alternatives = cards.slice(1, 3).map((card) => card.title).filter(Boolean)
  return [
    "已经生成并写入选题库。",
    `推荐先拍：${first?.title || "先把这个问题讲透"}`,
    `开头：${first?.hook || first?.rationale || "先从用户最关心的问题开口。"}`,
    alternatives.length > 0 ? `还能拍：${alternatives.join("、")}` : null,
    input.topicSelectionId ? `AIM 选题记录：${buildTopicSelectionUrl(input.topicSelectionId)}` : null,
  ].filter(Boolean).join("\n")
}

export const INSPIRATION_ACCEPTED_REPLY = "已收录，正在提取视频文案并生成选题。"

function buildTopicSelectionUrl(topicSelectionId: string) {
  const baseUrl = (env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")
  return baseUrl ? `${baseUrl}/topic-planning?selectionId=${encodeURIComponent(topicSelectionId)}` : topicSelectionId
}
