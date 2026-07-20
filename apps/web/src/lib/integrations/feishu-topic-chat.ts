type JsonRecord = Record<string, unknown>
type FeishuTopicReply = {
  reply: {
    summary: string
    recommendedTitle: string
    opening: string
    alternatives: string[]
    nextActionLabel: string
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

/**
 * @description 校验feishueventtoken
 * @param payload - payload
 * @param expectedToken - expected令牌
 * @returns 无返回值
 */
export function verifyFeishuEventToken(payload: unknown, expectedToken: string) {
  if (!expectedToken) return false
  const record = asRecord(payload)
  const header = asRecord(record?.header)
  const token = readString(header?.token) || readString(record?.token)
  return token === expectedToken
}

/**
 * @description 解析feishumessageevent
 * @param payload - payload
 * @returns 无返回值
 */
export function parseFeishuMessageEvent(payload: unknown): { messageId: string; text: string } | null {
  const record = asRecord(payload)
  const header = asRecord(record?.header)
  if (readString(header?.event_type) !== "im.message.receive_v1") return null

  const event = asRecord(record?.event)
  const sender = asRecord(event?.sender)
  if (readString(sender?.sender_type) === "app") return null

  const message = asRecord(event?.message)
  if (readString(message?.message_type) !== "text") return null

  const messageId = readString(message?.message_id)
  const rawContent = readString(message?.content)
  if (!messageId || !rawContent) return null

  try {
    const content = JSON.parse(rawContent) as { text?: unknown }
    const text = readString(content.text).trim()
    return text ? { messageId, text } : null
  } catch {
    return null
  }
}

/**
 * @description 解析feishusdkmessageevent
 * @param data - 数据
 * @returns 无返回值
 */
export function parseFeishuSdkMessageEvent(data: unknown): {
  messageId: string
  chatId: string
  senderId?: string
  text: string
  occurredAt?: string
  mentionsBot: boolean
} | null {
  const record = asRecord(data)
  const sender = asRecord(record?.sender)
  if (readString(sender?.sender_type) === "app") return null
  const message = asRecord(record?.message)
  if (readString(message?.message_type) !== "text") return null
  const messageId = readString(message?.message_id)
  const chatId = readString(message?.chat_id)
  const rawContent = readString(message?.content)
  if (!messageId || !chatId || !rawContent) return null
  try {
    const content = JSON.parse(rawContent) as { text?: unknown }
    let text = readString(content.text).trim()
    const mentions = Array.isArray(message?.mentions) ? message.mentions : []
    let mentionsBot = false
    for (const mention of mentions) {
      const key = readString(asRecord(mention)?.key)
      const mentionType = readString(asRecord(mention)?.mention_type)
      if (key) text = text.replaceAll(key, "@助手")
      // Detect bot mention: @sender_type=app means the bot is being mentioned
      if (mentionType === "app" || mentionType === "user") {
        // Check if this mention refers to the app itself (id.type === "app")
        const id = asRecord(asRecord(mention)?.id)
        if (readString(id?.type) === "app") mentionsBot = true
      }
    }
    const senderId = asRecord(sender?.sender_id)
    const createTime = readString(message?.create_time)
    const timestamp = /^\d+$/.test(createTime) ? Number(createTime) : 0
    const occurredAt = timestamp > 0 ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toISOString() : undefined
    return text ? {
      messageId,
      chatId,
      senderId: readString(senderId?.open_id) || readString(senderId?.user_id) || undefined,
      text,
      occurredAt,
      mentionsBot,
    } : null
  } catch {
    return null
  }
}

/**
 * @description 构建feishutextreply
 * @param input - 输入数据
 * @returns 无返回值
 */
export function buildFeishuTextReply(input: FeishuTopicReply) {
  const alternatives = input.reply.alternatives.length > 0
    ? `\n还能拍：${input.reply.alternatives.join("、")}`
    : ""
  return [
    input.reply.summary,
    "",
    `建议先拍：${input.reply.recommendedTitle}`,
    `开头：${input.reply.opening}${alternatives}`,
    "",
    `下一步：回复「${input.reply.nextActionLabel}」`,
  ].join("\n")
}

/**
 * @description 获取feishutenantaccesstoken
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function getFeishuTenantAccessToken(input: {
  appId: string
  appSecret: string
  fetchImpl?: typeof fetch
}) {
  const fetcher = input.fetchImpl ?? fetch
  const response = await fetcher("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: input.appId,
      app_secret: input.appSecret,
    }),
  })
  const payload = await response.json() as { code?: number; msg?: string; tenant_access_token?: string }
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(payload.msg || "飞书 tenant_access_token 获取失败")
  }
  return payload.tenant_access_token
}

/**
 * @description replyfeishutextmessage
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function replyFeishuTextMessage(input: {
  messageId: string
  text: string
  tenantAccessToken: string
  idempotencyKey?: string
  fetchImpl?: typeof fetch
}) {
  const fetcher = input.fetchImpl ?? fetch
  const response = await fetcher(
    `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(input.messageId)}/reply`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.tenantAccessToken}`,
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
    throw new Error(payload.msg || "飞书消息回复失败")
  }
}
