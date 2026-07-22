// ─── 飞书交互卡片构建器 ─────────────────────────────────────
// 为多 Bot 推送生成飞书交互卡片（interactive message card）JSON。
// 卡片包含审核按钮（通过/打回），按钮回调走 /api/integrations/feishu/card-actions。
// 纯函数，无 IO。

import type { FeishuAgentBotConfig } from "./feishu-agent-registry"

export interface WorkItemCardInput {
  /** 经营事项名称 */
  itemName: string
  /** 飞书 Base 记录 ID */
  recordId: string
  /** 工作流 ID */
  workflowId: string
  /** 卡片类型 */
  cardType: "review_required" | "completed" | "failed"
  /** 结果摘要（可选） */
  summary?: string
  /** 结果链接（可选） */
  resultLink?: string
  /** 错误信息（失败时） */
  errorMessage?: string
}

const CARD_TYPE_CONFIG = {
  review_required: {
    title: "待人工审核",
    color: "orange",
    showActions: true,
  },
  completed: {
    title: "已完成",
    color: "green",
    showActions: false,
  },
  failed: {
    title: "执行失败",
    color: "red",
    showActions: false,
  },
} as const

/**
 * 构建经营事项交互卡片 JSON。
 */
export function buildWorkItemCard(bot: FeishuAgentBotConfig, input: WorkItemCardInput): string {
  const config = CARD_TYPE_CONFIG[input.cardType]
  const headerTitle = `${bot.displayName} | ${config.title}`

  const elements: unknown[] = []

  // 事项名称
  elements.push({
    tag: "div",
    text: { tag: "lark_md", content: `**事项：** ${input.itemName}` },
  })

  // 摘要
  if (input.summary) {
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `**摘要：** ${truncate(input.summary, 200)}` },
    })
  }

  // 错误信息
  if (input.errorMessage) {
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `**错误：** ${truncate(input.errorMessage, 200)}` },
    })
  }

  // 结果链接
  if (input.resultLink) {
    elements.push({
      tag: "action",
      actions: [{
        tag: "button",
        text: { tag: "plain_text", content: "查看完整结果" },
        type: "primary",
        url: input.resultLink,
      }],
    })
  }

  // 审核按钮（仅 review_required）
  if (config.showActions) {
    elements.push({ tag: "hr" })
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "通过" },
          type: "success",
          value: { action: "approve", recordId: input.recordId, workflowId: input.workflowId },
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "打回修改" },
          type: "danger",
          value: { action: "reject", recordId: input.recordId, workflowId: input.workflowId },
        },
      ],
    })
  }

  // 底部备注
  elements.push({
    tag: "note",
    elements: [{ tag: "plain_text", content: `记录ID: ${input.recordId}` }],
  })

  const card = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: headerTitle },
      template: config.color,
    },
    elements,
  }

  return JSON.stringify(card)
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + "……"
}
