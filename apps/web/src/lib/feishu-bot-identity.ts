// ─── 飞书多 Bot 身份回复层 ─────────────────────────────────
// 以指定 bot 的 tenant_access_token 发送消息，使消息在飞书中显示为该机器人发出。
// per-bot token 缓存（内存 Map，TTL 100 分钟，飞书 token 有效期 2 小时）。
// 复用 feishu-topic-chat.ts 的底层函数，仅扩展为多凭证。

import { getFeishuTenantAccessToken } from "@/lib/integrations/feishu-topic-chat"
import type { FeishuAgentBotConfig } from "./feishu-agent-registry"

// ─── Token 缓存 ─────────────────────────────────────────────

interface CachedToken {
  token: string
  expiresAt: number
}

const TOKEN_TTL_MS = 100 * 60 * 1000 // 100 分钟（飞书有效期 2 小时，提前 20 分钟刷新）

const tokenCache = new Map<string, CachedToken>()

/**
 * 获取指定 bot 的 tenant_access_token（带内存缓存）。
 * 缓存 key = appId，不同 bot 的 appId 不同所以天然隔离。
 */
export async function getBotTenantToken(
  bot: FeishuAgentBotConfig,
  fetchImpl?: typeof fetch,
): Promise<string> {
  const cacheKey = bot.appId
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token
  }

  const token = await getFeishuTenantAccessToken({
    appId: bot.appId,
    appSecret: bot.appSecret,
    fetchImpl,
  })

  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS })
  return token
}

/** 清除指定 bot 的 token 缓存（用于 token 失效后强制刷新）。 */
export function invalidateBotToken(bot: FeishuAgentBotConfig): void {
  tokenCache.delete(bot.appId)
}

// ─── 回复消息 ─────────────────────────────────────────────

/**
 * 以指定 bot 身份回复一条消息（线程内回复）。
 */
export async function replyAsBot(input: {
  bot: FeishuAgentBotConfig
  messageId: string
  text: string
  idempotencyKey?: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const fetcher = input.fetchImpl ?? fetch
  const token = await getBotTenantToken(input.bot, fetcher)

  const response = await fetcher(
    `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(input.messageId)}/reply`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msg_type: "text",
        content: JSON.stringify({ text: input.text }),
        uuid: input.idempotencyKey,
      }),
    },
  )
  const payload = await response.json() as { code?: number; msg?: string }
  if (!response.ok || payload.code !== 0) {
    // token 过期时清缓存，下次自动刷新
    if (payload.code === 99991663 || payload.code === 99991661) {
      invalidateBotToken(input.bot)
    }
    throw new Error(payload.msg || "飞书消息回复失败")
  }
}

// ─── 主动发送到群 ─────────────────────────────────────────────

/**
 * 以指定 bot 身份主动发送文本消息到群/个人。
 */
export async function sendToChatAsBot(input: {
  bot: FeishuAgentBotConfig
  chatId: string
  text: string
  idempotencyKey?: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const fetcher = input.fetchImpl ?? fetch
  const token = await getBotTenantToken(input.bot, fetcher)

  const response = await fetcher(
    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: input.chatId,
        msg_type: "text",
        content: JSON.stringify({ text: input.text }),
        uuid: input.idempotencyKey,
      }),
    },
  )
  const payload = await response.json() as { code?: number; msg?: string }
  if (!response.ok || payload.code !== 0) {
    if (payload.code === 99991663 || payload.code === 99991661) {
      invalidateBotToken(input.bot)
    }
    throw new Error(payload.msg || "飞书消息发送失败")
  }
}

// ─── 交互卡片 ─────────────────────────────────────────────

/**
 * 以指定 bot 身份发送交互卡片（interactive message card）到群。
 * cardJson 为飞书卡片 JSON 字符串。
 */
export async function sendCardAsBot(input: {
  bot: FeishuAgentBotConfig
  chatId: string
  cardJson: string
  idempotencyKey?: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const fetcher = input.fetchImpl ?? fetch
  const token = await getBotTenantToken(input.bot, fetcher)

  const response = await fetcher(
    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: input.chatId,
        msg_type: "interactive",
        content: input.cardJson,
        uuid: input.idempotencyKey,
      }),
    },
  )
  const payload = await response.json() as { code?: number; msg?: string }
  if (!response.ok || payload.code !== 0) {
    if (payload.code === 99991663 || payload.code === 99991661) {
      invalidateBotToken(input.bot)
    }
    throw new Error(payload.msg || "飞书卡片消息发送失败")
  }
}
