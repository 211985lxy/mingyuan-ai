import { createHash } from "node:crypto"
import { isChanjingConfigured } from "@/lib/chanjing"
import { createDigitalHumanVideoFromAudio } from "@/lib/chanjing-audio"
import { generateSignedUrl, isOssConfigured, uploadBufferToOss } from "@/lib/oss"
import {
  FISH_AUDIO_MAX_TEXT_LENGTH,
  isFishAudioConfigured,
  synthesizeSpeech,
} from "@/lib/voice/fish-audio"

/**
 * 自有语音（Fish Audio）→ OSS → 蝉镜 audio 型数字人视频的桥接层。
 *
 * 蝉镜 create_video 的 audio.type="audio" 需要供应商可抓取的音频 URL；
 * Fish Audio 只产字节流，因此先落受管 OSS，再显式签名供抓取。
 */

/** 第三方文档口径：音频 ≤100MB、≤10 分钟（官方复核前按保守值拦截） */
const CHANJING_AUDIO_MAX_BYTES = 100 * 1024 * 1024
/**
 * 签名有效期必须覆盖「下单 → 蝉镜开始处理时抓取」全程；
 * 视频轮询超时为 20min，排队可能更久，取 6h 并显式传递（函数默认仅 2h）。
 */
export const CHANJING_GRAB_URL_TTL_SECONDS = 6 * 60 * 60

export type DigitalHumanVoiceBridgeErrorCode =
  | "VOICE_NOT_CONFIGURED"
  | "OSS_NOT_CONFIGURED"
  | "CHANJING_NOT_CONFIGURED"
  | "TEXT_TOO_LONG"
  | "AUDIO_TOO_LARGE"

export class DigitalHumanVoiceBridgeError extends Error {
  constructor(
    public code: DigitalHumanVoiceBridgeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "DigitalHumanVoiceBridgeError"
  }
}

export interface OwnVoiceSynthesis {
  /** 受管 OSS 对象 URL（私有读，长期持有用） */
  ossUrl: string
  /** 供蝉镜抓取的签名 URL（有效期见 CHANJING_GRAB_URL_TTL_SECONDS） */
  signedUrl: string
  contentType: string
  model: string
  charCount: number
  bytes: number
}

export function buildVoiceObjectKey(userId: string, format: string): string {
  const stamp = new Date().toISOString().replaceAll(/[-:T]/g, "").slice(0, 14)
  const rand = createHash("sha1")
    .update(`${userId}:${stamp}:${Math.random()}`)
    .digest("hex")
    .slice(0, 8)
  return `digital-human-voice/${userId}/${stamp}-${rand}.${format}`
}

/**
 * 用自有语音 API 合成一段文案并落到受管 OSS，返回蝉镜可抓取的签名 URL。
 * 与语音历史不同：这里 OSS 未配置或上传失败都不能降级——蝉镜拿不到 URL 就无法下单。
 */
export async function synthesizeOwnVoiceToOss(input: {
  userId: string
  text: string
  voiceId?: string | null
  model?: string | null
  format?: "mp3" | "wav"
  speed?: number
}): Promise<OwnVoiceSynthesis> {
  if (!isFishAudioConfigured()) {
    throw new DigitalHumanVoiceBridgeError(
      "VOICE_NOT_CONFIGURED",
      "语音服务未配置，请联系管理员检查 FISH_AUDIO_API_KEY",
    )
  }
  if (!isOssConfigured()) {
    throw new DigitalHumanVoiceBridgeError(
      "OSS_NOT_CONFIGURED",
      "对象存储未配置，无法为数字人提供音频地址",
    )
  }
  if (input.text.trim().length > FISH_AUDIO_MAX_TEXT_LENGTH) {
    throw new DigitalHumanVoiceBridgeError(
      "TEXT_TOO_LONG",
      `单段配音最多 ${FISH_AUDIO_MAX_TEXT_LENGTH} 字，请先拆分文案`,
    )
  }

  const format = input.format ?? "mp3"
  const synthesized = await synthesizeSpeech({
    text: input.text,
    voiceId: input.voiceId ?? null,
    model: input.model ?? null,
    format,
    speed: input.speed,
  })

  const bytes = synthesized.audio.byteLength
  if (bytes > CHANJING_AUDIO_MAX_BYTES) {
    throw new DigitalHumanVoiceBridgeError(
      "AUDIO_TOO_LARGE",
      "合成音频超过蝉镜 100MB 上限，请缩短文案",
    )
  }

  const ossUrl = await uploadBufferToOss(
    buildVoiceObjectKey(input.userId, format),
    Buffer.from(synthesized.audio),
    synthesized.contentType,
  )

  return {
    ossUrl,
    signedUrl: generateSignedUrl(ossUrl, CHANJING_GRAB_URL_TTL_SECONDS),
    contentType: synthesized.contentType,
    model: synthesized.model,
    charCount: synthesized.charCount,
    bytes,
  }
}

/**
 * 用一段已有音频（受管 OSS URL 或任何蝉镜可抓取 URL）驱动数字人下单。
 * 传受管 OSS URL 时会重新按抓取 TTL 签名，避免复用过期链接。
 */
export async function createOwnVoiceDigitalHumanVideo(input: {
  audioUrl: string
  personId: string
  figureType: string
  personWidth: number
  personHeight: number
  screenWidth?: number
  screenHeight?: number
  volume?: number
}) {
  if (!isChanjingConfigured()) {
    throw new DigitalHumanVoiceBridgeError(
      "CHANJING_NOT_CONFIGURED",
      "蝉镜数字人服务未配置，请联系管理员",
    )
  }
  const signedUrl = generateSignedUrl(input.audioUrl, CHANJING_GRAB_URL_TTL_SECONDS)
  return createDigitalHumanVideoFromAudio({
    wavUrl: signedUrl,
    personId: input.personId,
    figureType: input.figureType,
    personWidth: input.personWidth,
    personHeight: input.personHeight,
    screenWidth: input.screenWidth,
    screenHeight: input.screenHeight,
    volume: input.volume,
  })
}
