/**
 * HITL 审批飞书通知（Step③ P1）：高风险动作被对话轴门闩挂起时，
 * 给负责人群发一条通知，让审批不必守在控制台。
 *
 * 纯通知（不带交互按钮）：批准/驳回仍在 AIM 控制台对话内完成，
 * 审批决策与执行链路（approval-decision-store + hitl-gate）不因通知失败受影响。
 * 开关 `AIM_HITL_NOTIFY_ENABLED` 默认关闭；发送失败仅 warn，绝不阻塞对话。
 */

import { env } from "@/env"
import { getFeishuTenantAccessToken } from "@/lib/integrations/feishu-topic-chat"
import type { HitlApprovalRequired } from "@/lib/aim/hitl-gate"

export type HitlNotifyConfig =
  | { enabled: false }
  | { enabled: true; appId: string; appSecret: string; chatId: string }

type HitlNotifyEnvironment = Partial<Pick<NodeJS.ProcessEnv,
  | "AIM_HITL_NOTIFY_ENABLED"
  | "AIM_HITL_NOTIFY_CHAT_ID"
  | "FEISHU_APP_ID"
  | "FEISHU_APP_SECRET"
>>

function runtimeEnvironment(): HitlNotifyEnvironment {
  return {
    AIM_HITL_NOTIFY_ENABLED: env.AIM_HITL_NOTIFY_ENABLED,
    AIM_HITL_NOTIFY_CHAT_ID: env.AIM_HITL_NOTIFY_CHAT_ID,
    FEISHU_APP_ID: env.FEISHU_APP_ID,
    FEISHU_APP_SECRET: env.FEISHU_APP_SECRET,
  }
}

/**
 * @description 读取 HITL 通知配置（未开启或配置不全 → disabled，绝不抛错）
 */
export function readHitlNotifyConfig(
  source: HitlNotifyEnvironment = runtimeEnvironment(),
): HitlNotifyConfig {
  if (source.AIM_HITL_NOTIFY_ENABLED?.trim().toLowerCase() !== "true") {
    return { enabled: false }
  }
  const appId = source.FEISHU_APP_ID?.trim() || ""
  const appSecret = source.FEISHU_APP_SECRET?.trim() || ""
  const chatId = source.AIM_HITL_NOTIFY_CHAT_ID?.trim() || ""
  if (!appId || !appSecret || !chatId) return { enabled: false }
  return { enabled: true, appId, appSecret, chatId }
}

/**
 * @description 格式化 HITL 审批通知文本
 */
export function formatHitlApprovalNotification(
  approval: HitlApprovalRequired,
  context: { projectId?: string } = {},
): string {
  return [
    "【AIM 需人工审批】",
    `事项：${approval.label}`,
    `风险类型：${approval.risk === "external_send" ? "对外发送" : "写知识库"}`,
    context.projectId ? `项目：${context.projectId}` : "",
    "请在 AIM 控制台对应对话内回复「批准」或「驳回」；未批准前该操作不会执行。",
  ].filter(Boolean).join("\n")
}

/**
 * @description 构建交互审批卡片内容（批准/驳回按钮回调到 hitl-card-actions）
 */
export function buildHitlApprovalCard(
  approval: HitlApprovalRequired,
  context: { projectId?: string } = {},
): Record<string, unknown> {
  const buttonValue = {
    hitl_request_id: approval.approvalRequestId,
    hitl_project_id: context.projectId ?? "",
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "AIM 需人工审批" },
      template: "red",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            `**事项**：${approval.label}`,
            `**风险类型**：${approval.risk === "external_send" ? "对外发送" : "写知识库"}`,
            context.projectId ? `**项目**：${context.projectId}` : "",
            "未批准前该操作不会执行。批准/驳回记录计入飞书审批人。",
          ].filter(Boolean).join("\n"),
        },
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "批准" },
            type: "primary",
            value: { ...buttonValue, hitl_action: "approve" },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "驳回" },
            type: "danger",
            value: { ...buttonValue, hitl_action: "reject" },
          },
        ],
      },
    ],
  }
}

/**
 * @description 发送 HITL 审批通知（交互卡片；配置关闭时静默跳过）
 */
export async function sendHitlApprovalNotification(input: {
  config: HitlNotifyConfig
  approval: HitlApprovalRequired
  context?: { projectId?: string }
  fetchImpl?: typeof fetch
}): Promise<void> {
  if (!input.config.enabled) return
  const fetcher = input.fetchImpl ?? fetch
  const tenantAccessToken = await getFeishuTenantAccessToken({
    appId: input.config.appId,
    appSecret: input.config.appSecret,
    fetchImpl: fetcher,
  })
  const response = await fetcher(
    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: input.config.chatId,
        msg_type: "interactive",
        content: JSON.stringify(buildHitlApprovalCard(input.approval, input.context)),
      }),
    },
  )
  const payload = await response.json() as { code?: number; msg?: string }
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || "飞书 HITL 通知发送失败")
  }
}

/** 通知失败仅告警：审批主流程不因通知通道故障受阻。 */
export function notifyHitlApprovalRequired(
  approval: HitlApprovalRequired,
  context: { projectId?: string } = {},
): void {
  void sendHitlApprovalNotification({
    config: readHitlNotifyConfig(),
    approval,
    context,
  }).catch((error: unknown) => {
    console.warn("[hitl-notify] 审批通知发送失败:", error instanceof Error ? error.message : error)
  })
}
