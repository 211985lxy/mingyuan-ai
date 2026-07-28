import type { AimChatBody } from "@/features/aim/contracts/api"

export const AIM_CHAT_REQUEST_BUDGET_BYTES = 56 * 1024

type AimChatRequestBody = AimChatBody & {
  traceId?: string
}

const encoder = new TextEncoder()
const TRUNCATION_MARKER = "\n…（上下文已按请求大小截断）…\n"

function jsonBytes(value: unknown) {
  return encoder.encode(JSON.stringify(value)).byteLength
}

function truncateMiddleToBytes(text: string, maxBytes: number) {
  if (encoder.encode(text).byteLength <= maxBytes) return text
  if (maxBytes <= encoder.encode(TRUNCATION_MARKER).byteLength) return ""

  const chars = Array.from(text)
  let low = 0
  let high = chars.length
  while (low < high) {
    const count = Math.ceil((low + high) / 2)
    const headCount = Math.ceil(count * 0.6)
    const candidate = `${chars.slice(0, headCount).join("")}${TRUNCATION_MARKER}${chars.slice(-(count - headCount)).join("")}`
    if (encoder.encode(candidate).byteLength <= maxBytes) low = count
    else high = count - 1
  }

  const headCount = Math.ceil(low * 0.6)
  return `${chars.slice(0, headCount).join("")}${TRUNCATION_MARKER}${chars.slice(-(low - headCount)).join("")}`
}

function trimEditorContext(body: AimChatRequestBody) {
  if (!body.editorContext) return body
  return {
    ...body,
    editorContext: {
      ...body.editorContext,
      referenceSelection: body.editorContext.referenceSelection
        ? truncateMiddleToBytes(body.editorContext.referenceSelection, 8 * 1024)
        : undefined,
      draftSelection: body.editorContext.draftSelection
        ? truncateMiddleToBytes(body.editorContext.draftSelection, 8 * 1024)
        : undefined,
      draftText: body.editorContext.draftText
        ? truncateMiddleToBytes(body.editorContext.draftText, 12 * 1024)
        : undefined,
    },
  }
}

function trimLatestMessage(body: AimChatRequestBody) {
  const messages = [...body.messages]
  const latest = messages.at(-1)
  if (!latest) return body

  const overhead = jsonBytes({ ...body, messages: [{ ...latest, content: "" }] })
  const available = Math.max(0, AIM_CHAT_REQUEST_BUDGET_BYTES - overhead)
  if (typeof latest.content === "string") {
    messages[messages.length - 1] = {
      ...latest,
      content: truncateMiddleToBytes(latest.content, available),
    }
  } else {
    const textPartCount = Math.max(1, latest.content.filter((part) => part.type === "text").length)
    const textPartBudget = Math.floor(available / textPartCount)
    const parts = latest.content.map((part) => part.type === "text"
      ? { ...part, text: truncateMiddleToBytes(part.text, textPartBudget) }
      : part)
    messages[messages.length - 1] = { ...latest, content: parts }
  }
  return { ...body, messages }
}

/**
 * Keep chat requests below the server's 64 KiB parser limit.
 * Recent turns win over old turns; only oversized requests are changed.
 */
export function fitAimChatRequestBody(body: AimChatRequestBody): AimChatRequestBody {
  if (jsonBytes(body) <= AIM_CHAT_REQUEST_BUDGET_BYTES) return body

  let fitted = { ...body, messages: [...body.messages] }
  while (fitted.messages.length > 1 && jsonBytes(fitted) > AIM_CHAT_REQUEST_BUDGET_BYTES) {
    fitted = { ...fitted, messages: fitted.messages.slice(1) }
  }
  if (jsonBytes(fitted) <= AIM_CHAT_REQUEST_BUDGET_BYTES) return fitted

  fitted = trimEditorContext(fitted)
  if (jsonBytes(fitted) <= AIM_CHAT_REQUEST_BUDGET_BYTES) return fitted

  fitted = trimLatestMessage(fitted)
  if (jsonBytes(fitted) <= AIM_CHAT_REQUEST_BUDGET_BYTES) return fitted

  // An unusually large image URL can be the only remaining overflow source.
  const latest = fitted.messages.at(-1)
  if (latest && Array.isArray(latest.content)) {
    const textParts = latest.content.filter((part) => part.type === "text")
    fitted = {
      ...fitted,
      messages: [{
        ...latest,
        content: textParts.length > 0
          ? textParts
          : [{ type: "text", text: "图片链接过大，请重新上传后再试。" }],
      }],
    }
  }
  return fitted
}

export function serializeAimChatRequestBody(body: AimChatRequestBody) {
  return JSON.stringify(fitAimChatRequestBody(body))
}
