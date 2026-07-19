import { getFeishuTenantAccessToken } from "@/lib/integrations/feishu-topic-chat"
import { env } from "@/env"

export type SupervisorNotificationType =
  | "review_required"
  | "human_judgment"
  | "manual_takeover"
  | "execution_timeout"

export interface SupervisorNotification {
  type: SupervisorNotificationType
  recordId: string
  loopId: string
  runId?: string
  summary: string
  nextAction: string
  resultLink?: string
}

export type SupervisorNotificationConfig =
  | { enabled: false }
  | { enabled: true; appId: string; appSecret: string; chatId: string }

type SupervisorNotificationEnvironment = Partial<Pick<NodeJS.ProcessEnv,
  | "AIM_LOOP_NOTIFICATIONS_ENABLED"
  | "AIM_SUPERVISOR_CHAT_ID"
  | "FEISHU_APP_ID"
  | "FEISHU_APP_SECRET"
>>

function runtimeNotificationEnvironment(): SupervisorNotificationEnvironment {
  return {
    AIM_LOOP_NOTIFICATIONS_ENABLED: env.AIM_LOOP_NOTIFICATIONS_ENABLED,
    AIM_SUPERVISOR_CHAT_ID: env.AIM_SUPERVISOR_CHAT_ID,
    FEISHU_APP_ID: env.FEISHU_APP_ID,
    FEISHU_APP_SECRET: env.FEISHU_APP_SECRET,
  }
}

export function readSupervisorNotificationConfig(
  source: SupervisorNotificationEnvironment = runtimeNotificationEnvironment(),
): SupervisorNotificationConfig {
  if (source.AIM_LOOP_NOTIFICATIONS_ENABLED?.trim().toLowerCase() !== "true") {
    return { enabled: false }
  }
  const appId = source.FEISHU_APP_ID?.trim() || ""
  const appSecret = source.FEISHU_APP_SECRET?.trim() || ""
  const chatId = source.AIM_SUPERVISOR_CHAT_ID?.trim() || ""
  const missing = [
    ["FEISHU_APP_ID", appId],
    ["FEISHU_APP_SECRET", appSecret],
    ["AIM_SUPERVISOR_CHAT_ID", chatId],
  ].filter(([, value]) => !value).map(([name]) => name)
  if (missing.length > 0) {
    throw new Error(`飞书监督通知已启用但缺少配置：${missing.join("、")}`)
  }
  return { enabled: true, appId, appSecret, chatId }
}

function notificationTitle(type: SupervisorNotificationType): string {
  if (type === "review_required") return "AIM 待人工审核"
  if (type === "human_judgment") return "AIM 需人工判断"
  if (type === "execution_timeout") return "AIM 执行超时"
  return "AIM 需人工接管"
}

export function sanitizeSupervisorText(value: string): string {
  return value
    .replace(/authorization\s*[:=]\s*bearer\s+\S+/gi, "Authorization: [REDACTED]")
    .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[REDACTED]")
    .slice(0, 500)
}

export function supervisedFailureSummary(stopReason: string): string {
  if (stopReason === "execution_timeout") return "模型或网络请求超时，未自动扩大调用次数。"
  if (stopReason === "missing_input") return "经营事项输入或配置不完整，请打开任务查看缺失项。"
  if (stopReason === "verification_failed") return "确定性验证未通过，请打开任务核对原文证据。"
  if (stopReason === "retry_exhausted") return "自动重试预算已耗尽，请人工接管。"
  return "自动执行失败，请打开经营事项或运行追踪查看详情。"
}

export function formatSupervisorNotification(input: SupervisorNotification): string {
  return [
    `【${notificationTitle(input.type)}】`,
    `经营事项：${input.recordId}`,
    `Loop：${input.loopId}`,
    input.runId ? `运行ID：${input.runId}` : "",
    `摘要：${sanitizeSupervisorText(input.summary)}`,
    `下一步：${sanitizeSupervisorText(input.nextAction)}`,
    input.resultLink ? `结果：${input.resultLink}` : "",
  ].filter(Boolean).join("\n")
}

export async function sendFeishuSupervisorNotification(input: {
  config: SupervisorNotificationConfig
  notification: SupervisorNotification
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
        msg_type: "text",
        content: JSON.stringify({ text: formatSupervisorNotification(input.notification) }),
      }),
    },
  )
  const payload = await response.json() as { code?: number; msg?: string }
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || "飞书监督通知发送失败")
  }
}
