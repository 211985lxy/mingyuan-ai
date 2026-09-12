/**
 * 飞书选题裁决卡回调：信封归一化、解密、鉴权失败时的字段骨架。
 * 不含任何 token / open_id 值日志。
 */
import * as lark from "@larksuiteoapi/node-sdk"
import {
  loadAgentBotRegistry,
  type FeishuAgentBotConfig,
} from "@/lib/feishu-agent-registry"

export interface TopicCardActionValue {
  topic_action?: string
  topic_selection_id?: string
  topic_index?: number
}

export interface TopicCardCallbackBody {
  open_id?: string
  user_id?: string
  token?: string
  type?: string
  challenge?: string
  encrypt?: string
  app_id?: string
  action?: {
    value?: TopicCardActionValue
    tag?: string
  }
  schema?: string
  header?: {
    token?: string
    event_type?: string
    app_id?: string
  }
  event?: {
    token?: string
    operator?: {
      open_id?: string
      user_id?: string
    }
    action?: {
      value?: TopicCardActionValue
      tag?: string
    }
  }
}

export interface DecryptedCallback {
  payload: TopicCardCallbackBody
  bot: FeishuAgentBotConfig | null
}

export function normalizeCallbackBody(body: TopicCardCallbackBody): TopicCardCallbackBody {
  const headerToken = body.header?.token
  const eventToken = body.event?.token
  const operator = body.event?.operator
  const eventAction = body.event?.action
  if (!headerToken && !eventToken && !operator && !eventAction) return body
  return {
    ...body,
    token: body.token ?? eventToken ?? headerToken,
    open_id: body.open_id ?? operator?.open_id,
    user_id: body.user_id ?? operator?.user_id,
    action: body.action ?? eventAction,
  }
}

export function describeShape(value: unknown, depth = 0): unknown {
  if (depth > 2) return typeof value
  if (Array.isArray(value)) return `array(${value.length})`
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).map((key) => [key, describeShape((value as Record<string, unknown>)[key], depth + 1)]),
    )
  }
  return typeof value
}

export function decryptCallbackBody(body: TopicCardCallbackBody): DecryptedCallback | null {
  if (typeof body.encrypt !== "string" || !body.encrypt) return body ? { payload: body, bot: null } : null
  for (const bot of loadAgentBotRegistry()) {
    if (!bot.encryptKey) continue
    try {
      const decrypted = JSON.parse(new lark.AESCipher(bot.encryptKey).decrypt(body.encrypt))
      if (decrypted && typeof decrypted === "object") {
        return { payload: decrypted as TopicCardCallbackBody, bot }
      }
    } catch {
      // 不是这个 bot 的 key，换下一个
    }
  }
  return null
}

export function resolveTopicCardBot(input: {
  payload: TopicCardCallbackBody
  decryptedByBot: FeishuAgentBotConfig | null
  resolveByToken: (token: string) => FeishuAgentBotConfig | null
  resolveByAppId: (appId: string) => FeishuAgentBotConfig | null
}): FeishuAgentBotConfig | null {
  const explicitAppId =
    (typeof input.payload.header?.app_id === "string" ? input.payload.header.app_id : "") ||
    (typeof input.payload.app_id === "string" ? input.payload.app_id : "")
  return (
    input.decryptedByBot ??
    input.resolveByToken(typeof input.payload.token === "string" ? input.payload.token : "") ??
    input.resolveByAppId(explicitAppId)
  )
}

export function resolveReviewerId(body: TopicCardCallbackBody): string {
  return (
    (typeof body.open_id === "string" && body.open_id.trim()) ||
    (typeof body.user_id === "string" && body.user_id.trim()) ||
    ""
  )
}
