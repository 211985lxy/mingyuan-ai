import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import {
  deleteManagedOssObject,
  generateSignedUrl,
  isOssConfigured,
  uploadBufferToOss,
} from "@/lib/oss"

/** 长文导入的总字数上限（客户端分段后逐段合成，最后整体导入） */
export const VOICE_MAX_TOTAL_TEXT_LENGTH = 12000

export interface PersistSynthesisInput {
  userId: string
  text: string
  model: string
  voiceId: string | null
  format: string
  audio: ArrayBuffer
  segments: number
}

export interface VoiceHistoryItem {
  id: string
  textPreview: string
  textContent: string | null
  audioUrl: string | null
  model: string
  voiceId: string | null
  format: string
  segments: number
  charCount: number
  createdAt: string
}

function buildAudioKey(userId: string, format: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return `voice/${userId}/${stamp}-${randomUUID().slice(0, 8)}.${format}`
}

/**
 * 落库一次合成：全文入 DB，音频尽力转存 OSS。
 * OSS 未配置或上传失败时记录仍然保留（audioUrl 为空，历史里可重新生成）。
 */
export async function persistSynthesis(
  input: PersistSynthesisInput,
): Promise<string | null> {
  let audioUrl: string | null = null
  if (isOssConfigured() && input.format === "mp3") {
    try {
      audioUrl = await uploadBufferToOss(
        buildAudioKey(input.userId, input.format),
        Buffer.from(input.audio),
        "audio/mpeg",
      )
    } catch (error) {
      console.error("[voice/history] OSS 上传失败，仅保留文本记录:", error instanceof Error ? error.message : error)
    }
  }

  const record = await prisma.voiceSynthesisRecord.create({
    data: {
      userId: input.userId,
      model: input.model,
      voiceId: input.voiceId,
      format: input.format,
      textPreview: input.text.slice(0, 200),
      textContent: input.text,
      audioUrl,
      segments: input.segments,
      charCount: input.text.length,
    },
  })
  return record.id
}

/** 当前用户的历史记录，最新在前分页；音频 URL 换成短期签名地址。 */
export async function listSyntheses(
  userId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: VoiceHistoryItem[]; total: number }> {
  const safePage = Math.max(page, 1)
  const safeSize = Math.min(Math.max(pageSize, 1), 50)
  const [records, total] = await Promise.all([
    prisma.voiceSynthesisRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    }),
    prisma.voiceSynthesisRecord.count({ where: { userId } }),
  ])
  return {
    items: records.map((record) => ({
      id: record.id,
      textPreview: record.textPreview,
      textContent: record.textContent,
      audioUrl: record.audioUrl ? generateSignedUrl(record.audioUrl) : null,
      model: record.model,
      voiceId: record.voiceId,
      format: record.format,
      segments: record.segments,
      charCount: record.charCount,
      createdAt: record.createdAt.toISOString(),
    })),
    total,
  }
}

/** 删除当前用户的一条记录；OSS 对象尽力清理。 */
export async function deleteSynthesis(userId: string, id: string): Promise<boolean> {
  const record = await prisma.voiceSynthesisRecord.findFirst({ where: { id, userId } })
  if (!record) return false
  await prisma.voiceSynthesisRecord.delete({ where: { id: record.id } })
  if (record.audioUrl) {
    await deleteManagedOssObject(record.audioUrl).catch(() => false)
  }
  return true
}
