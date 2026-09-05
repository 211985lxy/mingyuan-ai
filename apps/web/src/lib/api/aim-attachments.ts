"use client"

/** 聊天文件附件解析结果：与 POST /api/aim/attachment-parse 响应保持一致。 */
export interface AimAttachmentParseResult {
  name: string
  size: number
  text: string
  truncated: boolean
}

/**
 * 粘贴/拖入的非图片文件交给服务端解析成文本（pdf/docx/xlsx 走受限解析，
 * 未知扩展名按纯文本探测）；失败时服务端返回人话错误。
 */
export async function parseAimChatAttachment(file: File): Promise<AimAttachmentParseResult> {
  const form = new FormData()
  form.set("file", file)

  const response = await fetch("/api/aim/attachment-parse", { method: "POST", body: form })
  const data: Partial<AimAttachmentParseResult> & { error?: string } | null =
    await response.json().catch(() => null)

  if (!response.ok || !data?.text) {
    throw new Error(data?.error || `${file.name} 解析失败`)
  }
  return {
    name: data.name ?? file.name,
    size: data.size ?? file.size,
    text: data.text,
    truncated: Boolean(data.truncated),
  }
}

/**
 * 聊天音频附件转写：已直传 OSS 的音频 URL → 阿里云录音文件识别 → 转写文本。
 */
export async function transcribeAimAudioAttachment(input: {
  audioUrl: string
  name: string
}): Promise<{ text: string }> {
  const response = await fetch("/api/aim/attachment-transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioUrl: input.audioUrl }),
  })
  const data: { text?: string; error?: string } | null = await response.json().catch(() => null)

  if (!response.ok || !data?.text) {
    throw new Error(data?.error || `${input.name} 转写失败`)
  }
  return { text: data.text }
}
