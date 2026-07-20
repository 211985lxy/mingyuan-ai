/**
 * IngressPolicy — pure function for unified event admission.
 *
 * Evaluates whether an incoming message should enter the inspiration pipeline
 * based on trigger mode, conversation type, message type, and mention status.
 * No database dependencies — all inputs are plain values.
 */

export type TriggerMode = "all" | "mention_or_keyword"
export type ConversationType = "direct" | "group"
export type MessageType = "text" | "share" | "file"

export interface IngressPolicyInput {
  /** The channel binding's trigger mode. */
  triggerMode: TriggerMode
  /** Keywords that trigger ingestion (only for mention_or_keyword mode). */
  triggerKeywords: string[]
  /** Whether the message is from a direct or group conversation. */
  conversationType?: ConversationType
  /** The type of message content. */
  messageType?: MessageType
  /** Whether the bot/app was mentioned in the message. */
  mentionsBot?: boolean
  /** The message text content (for keyword matching). */
  content: string
}

export interface IngressPolicyResult {
  allowed: boolean
  reason: string
}

/**
 * Evaluate whether an incoming event should be admitted into the pipeline.
 *
 * Rules:
 * 1. `conversationType` must be "group" (direct messages are rejected).
 * 2. `messageType` must be "text" or "share" ("file" is rejected in phase 1).
 * 3. `triggerMode=all` in a group context → always allowed.
 * 4. `triggerMode=mention_or_keyword`:
 *    - `mentionsBot === true` → allowed
 *    - content contains any keyword → allowed
 *    - otherwise → rejected
 */
/**
 * @description 评估ingresspolicy
 * @param input - 输入数据
 * @returns IngressPolicyResult
 */
export function evaluateIngressPolicy(input: IngressPolicyInput): IngressPolicyResult {
  // Rule 1: Reject direct messages (only groups are supported)
  if (input.conversationType === "direct") {
    return { allowed: false, reason: "DIRECT_MESSAGE_NOT_SUPPORTED" }
  }

  // Rule 2: Reject file messages (phase 1 — only text and share links)
  if (input.messageType === "file") {
    return { allowed: false, reason: "UNSUPPORTED_MESSAGE_TYPE" }
  }

  // Rule 3: "all" mode — every group message is ingested
  if (input.triggerMode === "all") {
    return { allowed: true, reason: "" }
  }

  // Rule 4: "mention_or_keyword" mode
  // 4a: Structured mention check (preferred over text scanning)
  if (input.mentionsBot === true) {
    return { allowed: true, reason: "" }
  }

  // 4b: Keyword matching in content
  const keywords = Array.isArray(input.triggerKeywords)
    ? input.triggerKeywords.filter((k): k is string => typeof k === "string" && k.length > 0)
    : ["收选题"]
  const hasKeyword = keywords.some((keyword) => input.content.includes(keyword))
  if (hasKeyword) {
    return { allowed: true, reason: "" }
  }

  return { allowed: false, reason: "TRIGGER_NOT_MATCHED" }
}
