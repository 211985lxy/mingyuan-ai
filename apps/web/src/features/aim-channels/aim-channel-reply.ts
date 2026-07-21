// ─── AIM 渠道回复格式化（纯逻辑，便于单测） ───────────────
// 决定生成结果怎么回给用户：短内容直接全文，长内容给摘要+网页链接。

/** 飞书单条文本消息建议不超过这个字符数（含格式），超过则改为摘要+链接。 */
export const AIM_CHANNEL_FULL_REPLY_CHAR_LIMIT = 800

/** 长内容摘要保留的前缀字符数。 */
export const AIM_CHANNEL_SUMMARY_PREFIX_CHARS = 200

export interface AimChannelReplyPlan {
  /** 发给用户的最终回复文本 */
  replyText: string
  /** true = 全文直接发；false = 摘要+链接 */
  fullContent: boolean
  /** 摘要（fullContent=false 时有值），用于落库 */
  summary: string | null
}

/**
 * 根据生成内容长度决定回复形态。
 *
 * @param content 智能体生成的正文
 * @param generationId 落库的 AimGeneration id（用于拼网页链接）
 * @param webBaseUrl 网页前端基址，如 https://mingyuan-ai.cn
 */
export function planAimChannelReply(input: {
  content: string
  generationId?: string
  webBaseUrl?: string
}): AimChannelReplyPlan {
  const content = input.content?.trim() || ""

  if (content.length <= AIM_CHANNEL_FULL_REPLY_CHAR_LIMIT) {
    return { replyText: content, fullContent: true, summary: null }
  }

  // 长内容：截断摘要 + 网页链接
  const summary = content.slice(0, AIM_CHANNEL_SUMMARY_PREFIX_CHARS).trim()
  const link = buildAimHistoryUrl(input.webBaseUrl, input.generationId)
  const replyText = [
    summary,
    "……",
    "",
    `（内容较长，完整版本：${link}）`,
  ].join("\n")

  return { replyText, fullContent: false, summary }
}

/** 拼接 AIM 历史记录的网页链接。 */
export function buildAimHistoryUrl(webBaseUrl: string | undefined, generationId: string | undefined): string {
  const base = (webBaseUrl || "https://mingyuan-ai.cn").replace(/\/$/, "")
  if (!generationId) return `${base}/aim`
  return `${base}/aim?record=${generationId}`
}

/** 短结果摘要：用于"收到，正在生成…"等固定提示语。 */
export const AIM_CHANNEL_ACK_REPLY = "收到，正在调用智能体生成，请稍候……"
