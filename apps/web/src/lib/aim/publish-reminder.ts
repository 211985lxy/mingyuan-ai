/**
 * 发布半自动提醒（WP-2.3）。
 *
 * 不自动外发。只找「已发布但还没作品 ID」的记录，组一张飞书提醒卡，
 * 让人点回去填 aweme_id。开关 AIM_PUBLISH_REMINDER_ENABLED 默认关。
 */

import { classifyPublishedWorkKey } from "@/lib/aim/platform-post-id"
import { DOUYIN_CREATOR_UPLOAD_URL } from "@/lib/aim/publish-pack"

export function isPublishReminderEnabled(): boolean {
  return process.env.AIM_PUBLISH_REMINDER_ENABLED === "true"
}

export interface PublishReminderRow {
  id: string
  userId: string
  projectId: string | null
  topicTitle: string | null
  publishPlatform: string | null
  publishUrl: string | null
  publishedAt: Date | null
}

export function needsWorkIdBackfill(row: PublishReminderRow): boolean {
  const key = classifyPublishedWorkKey(row.publishPlatform, row.publishUrl)
  return key.status === "missing" || key.status === "short"
}

export function buildPublishReminderCard(row: PublishReminderRow) {
  const title = row.topicTitle?.trim() || "未命名内容"
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "补作品 ID，回流才能自动跑" },
      template: "orange",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            `**${title}**`,
            `平台：${row.publishPlatform || "未填"}`,
            `链接：${row.publishUrl || "还没填"}`,
            `打开创作者页：${DOUYIN_CREATOR_UPLOAD_URL}`,
          ].join("\n"),
        },
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "去回填作品 ID" },
            type: "primary",
            url: `/aim?generationId=${encodeURIComponent(row.id)}`,
          },
        ],
      },
    ],
  }
}

export interface PublishReminderStorePort {
  aimGeneration: {
    findMany(args?: { where?: Record<string, unknown>; take?: number }): Promise<PublishReminderRow[]>
  }
}

export async function listPublishReminderDue(input: {
  store: PublishReminderStorePort
  now?: Date
  lookbackHours?: number
}): Promise<PublishReminderRow[]> {
  const now = input.now ?? new Date()
  const lookbackHours = input.lookbackHours ?? 48
  const since = new Date(now.getTime() - lookbackHours * 3600 * 1000)
  const rows = await input.store.aimGeneration.findMany({
    where: {
      workflowStatus: "published",
      publishedAt: { gte: since, lt: now },
    },
    take: 200,
  })
  return rows.filter((row) => {
    if (!row.publishedAt) return false
    const at = row.publishedAt.getTime()
    if (at < since.getTime() || at >= now.getTime()) return false
    return needsWorkIdBackfill(row)
  })
}
