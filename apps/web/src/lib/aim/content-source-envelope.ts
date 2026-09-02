import { z } from "zod"

import type { ContentFormat } from "@/lib/aim-generator"

const contentFormatSchema = z.enum([
  "video_script",
  "wechat_article",
  "moments_post",
  "community_message",
  "shooting_brief",
  "raw_copy",
  "koubo_script",
  "xiaohongshu_post",
])
const longText = z.string().max(100_000)

export const contentSourceEnvelopeSchema = z.object({
  currentUserRequest: longText.trim().min(1),
  relevantConversation: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: longText,
  }).strict()).max(20).default([]),
  currentArtifact: z.object({
    content: longText,
    format: contentFormatSchema.optional(),
    generationId: z.string().trim().min(1).max(80).optional(),
  }).strict().optional(),
  referenceMaterials: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    content: longText,
  }).strict()).max(8).default([]),
}).strict()

export interface AimContentSourceEnvelope {
  currentUserRequest: string
  relevantConversation: Array<{ role: "user" | "assistant"; content: string }>
  currentArtifact?: { content: string; format?: ContentFormat; generationId?: string }
  referenceMaterials: Array<{ title: string; content: string }>
}

const encoder = new TextEncoder()
const TRUNCATION_MARKER = "\n…（当前作品已按请求大小截断）…\n"

function jsonBytes(value: unknown) {
  return encoder.encode(JSON.stringify(value)).byteLength
}

function truncateMiddleToBytes(text: string, maxBytes: number) {
  if (encoder.encode(text).byteLength <= maxBytes) return text
  const markerBytes = encoder.encode(TRUNCATION_MARKER).byteLength
  if (maxBytes <= markerBytes) return ""

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

export function buildAimContentSourceEnvelope(input: {
  currentUserRequest: string
  relevantConversation: Array<{ role: "user" | "assistant"; content: string }>
  currentArtifact?: string
  currentArtifactFormat?: ContentFormat
  currentArtifactGenerationId?: string
  referenceMaterials: Array<{ title: string; content: string }>
}): AimContentSourceEnvelope {
  const relevantConversation = input.relevantConversation
    .slice(-12)
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
    .filter((turn) => turn.content.length > 0)
  const artifact = input.currentArtifact?.trim()
  return {
    currentUserRequest: input.currentUserRequest.trim(),
    relevantConversation,
    ...(artifact ? {
      currentArtifact: {
        content: artifact,
        ...(input.currentArtifactFormat ? { format: input.currentArtifactFormat } : {}),
        ...(input.currentArtifactGenerationId ? { generationId: input.currentArtifactGenerationId } : {}),
      },
    } : {}),
    referenceMaterials: input.referenceMaterials
      .map((item) => ({ title: item.title.trim(), content: item.content.trim() }))
      .filter((item) => item.title.length > 0 && item.content.length > 0),
  }
}

export function fitAimContentSourceEnvelopeToBudget(
  envelope: AimContentSourceEnvelope,
  maxBytes: number,
): AimContentSourceEnvelope {
  const requestOnly: AimContentSourceEnvelope = {
    currentUserRequest: envelope.currentUserRequest,
    relevantConversation: [],
    referenceMaterials: [],
  }
  if (jsonBytes(requestOnly) > maxBytes) throw new Error("当前要求超出可处理大小")

  let fitted: AimContentSourceEnvelope = {
    ...envelope,
    relevantConversation: [...envelope.relevantConversation],
    referenceMaterials: [...envelope.referenceMaterials],
    ...(envelope.currentArtifact ? { currentArtifact: { ...envelope.currentArtifact } } : {}),
  }
  while (jsonBytes(fitted) > maxBytes && fitted.relevantConversation.length > 0) {
    fitted = { ...fitted, relevantConversation: fitted.relevantConversation.slice(1) }
  }
  // 参考材料先逐条腰斩（保头保尾），尽量不整条丢弃——对标原文/拆解是核心素材
  if (jsonBytes(fitted) > maxBytes) {
    fitted = {
      ...fitted,
      referenceMaterials: fitted.referenceMaterials.map((item) => ({
        ...item,
        content: truncateMiddleToBytes(item.content, 12_000),
      })),
    }
  }
  while (jsonBytes(fitted) > maxBytes && fitted.referenceMaterials.length > 0) {
    fitted = { ...fitted, referenceMaterials: fitted.referenceMaterials.slice(0, -1) }
  }
  if (jsonBytes(fitted) > maxBytes && fitted.currentArtifact) {
    const overhead = jsonBytes({ ...fitted, currentArtifact: { ...fitted.currentArtifact, content: "" } })
    const available = Math.max(0, maxBytes - overhead - 32)
    const content = truncateMiddleToBytes(fitted.currentArtifact.content, available)
    fitted = content
      ? { ...fitted, currentArtifact: { ...fitted.currentArtifact, content } }
      : { ...fitted, currentArtifact: undefined }
  }
  if (jsonBytes(fitted) > maxBytes) throw new Error("来源上下文超出可处理大小")
  return fitted
}
