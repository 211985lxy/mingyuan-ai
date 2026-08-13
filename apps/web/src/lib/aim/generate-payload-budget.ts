import type { AimExecuteBody, AimGenerateBody } from "@/features/aim/contracts/api"
import { fitAimContentSourceEnvelopeToBudget } from "@/lib/aim/content-source-envelope"

/** 与 /api/aim/generate 的 parseJsonRecord maxBytes(256 KiB) 留余量对齐 */
export const AIM_GENERATE_REQUEST_BUDGET_BYTES = 240 * 1024
export const AIM_GENERATE_MAX_REQUEST_BYTES = 256 * 1024

type AimGenerateRequestBody = AimGenerateBody & {
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

/**
 * Keep generate requests below the server's 256 KiB parser limit.
 * Prefer trimming long conversation history in rawInput; keep the latest turn.
 */
export function fitAimGenerateRequestBody(body: AimGenerateRequestBody): AimGenerateRequestBody {
  if (jsonBytes(body) <= AIM_GENERATE_REQUEST_BUDGET_BYTES) return body

  if (body.sourceEnvelope) {
    const overhead = jsonBytes({ ...body, rawInput: "", sourceEnvelope: undefined })
    const sourceEnvelope = fitAimContentSourceEnvelopeToBudget(
      body.sourceEnvelope,
      Math.max(0, AIM_GENERATE_REQUEST_BUDGET_BYTES - overhead - 512),
    )
    const fitted = {
      ...body,
      rawInput: sourceEnvelope.currentUserRequest,
      sourceEnvelope,
    }
    if (jsonBytes(fitted) > AIM_GENERATE_REQUEST_BUDGET_BYTES) {
      throw new Error("来源上下文超出可处理大小")
    }
    return fitted
  }

  let fitted: AimGenerateRequestBody = { ...body }
  if (fitted.polishInstruction) {
    fitted = {
      ...fitted,
      polishInstruction: truncateMiddleToBytes(fitted.polishInstruction, 12 * 1024),
    }
    if (jsonBytes(fitted) <= AIM_GENERATE_REQUEST_BUDGET_BYTES) return fitted
  }

  const overhead = jsonBytes({ ...fitted, rawInput: "" })
  const available = Math.max(0, AIM_GENERATE_REQUEST_BUDGET_BYTES - overhead - 512)
  return {
    ...fitted,
    rawInput: truncateMiddleToBytes(fitted.rawInput, available),
  }
}

export function serializeAimGenerateRequestBody(body: AimGenerateRequestBody) {
  return JSON.stringify(fitAimGenerateRequestBody(body))
}

export function serializeAimExecuteRequestBody(body: AimExecuteBody) {
  const overhead = jsonBytes({ ...body, sourceEnvelope: undefined })
  const sourceEnvelope = fitAimContentSourceEnvelopeToBudget(
    body.sourceEnvelope,
    Math.max(0, AIM_GENERATE_REQUEST_BUDGET_BYTES - overhead - 512),
  )
  const fitted = { ...body, sourceEnvelope }
  if (jsonBytes(fitted) > AIM_GENERATE_REQUEST_BUDGET_BYTES) throw new Error("来源上下文超出可处理大小")
  return JSON.stringify(fitted)
}
