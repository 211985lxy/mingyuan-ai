import type { NextRequest } from "next/server"
import { INTERNAL_BETA_LIMITS } from "@/lib/internal-beta-limits"

type AudioInputResult =
  | { ok: true; audioBuffer: Buffer }
  | {
      ok: false
      status: 400 | 413
      error: { error: string; code?: "INTERNAL_BETA_UPLOAD_TOO_LARGE" }
    }

const tooLarge = (message: string): AudioInputResult => ({
  ok: false,
  status: 413,
  error: { error: message, code: "INTERNAL_BETA_UPLOAD_TOO_LARGE" },
})

export async function readAsrAudioInput(request: NextRequest): Promise<AudioInputResult> {
  const contentType = request.headers.get("content-type") || ""
  let audioBuffer: Buffer | null = null

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (file) {
      if (file.size > INTERNAL_BETA_LIMITS.uploadBytes) {
        return tooLarge("音频文件过大")
      }
      audioBuffer = Buffer.from(await file.arrayBuffer())
    }
  } else {
    const contentLength = Number(request.headers.get("content-length") || 0)
    if (Number.isFinite(contentLength) && contentLength > INTERNAL_BETA_LIMITS.uploadBytes) {
      return tooLarge("音频文件过大")
    }
    audioBuffer = Buffer.from(await request.arrayBuffer())
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return { ok: false, status: 400, error: { error: "未接收到有效的音频文件数据" } }
  }
  if (audioBuffer.length > INTERNAL_BETA_LIMITS.uploadBytes) {
    const maxMb = Math.round(INTERNAL_BETA_LIMITS.uploadBytes / 1024 / 1024)
    return tooLarge(`单个文件不能超过 ${maxMb}MB`)
  }

  return { ok: true, audioBuffer }
}
