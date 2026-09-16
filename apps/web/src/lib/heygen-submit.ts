/**
 * HeyGen v3 出片提交。
 *
 * 从 `digital-human-provider.ts` 拆出来，与既有的 `shanjian-submit.ts` 对齐
 * （一家 provider 一个提交模块）：四家 provider 的提交逻辑挤在一个文件里会突破
 * 架构门禁的单文件 500 行上限。
 *
 * 依赖单向：本文件 → `heygen.ts` / `digital-human-provider-error.ts`。
 */

import { createVideo as createHeygenVideo } from "@/lib/heygen"
import type { ShanjianSubmitResult } from "@/lib/shanjian"
import { DigitalHumanProviderError } from "./digital-human-provider-error"

const HEYGEN_VIDEO_TYPES = new Set([
  "virtualman_broadcast",
  "virtualman_video",
  "custom_virtualman_broadcast",
])

/**
 * 两种驱动二选一（与 /v3/videos 的契约一致）：
 * - 音频驱动：载荷里有 ownVoiceAudioUrl 时传 audio_url，脚本不参与（口型跟音频）
 * - 脚本驱动：传 script + voice_id，由 HeyGen 侧 TTS
 *
 * avatar_id 必填；缺失或类型不支持时 fail-closed，不提交半个任务。
 */
export async function submitHeygenVideo(
  videoType: string,
  payload: Record<string, unknown>,
): Promise<ShanjianSubmitResult> {
  if (!HEYGEN_VIDEO_TYPES.has(videoType)) {
    throw new DigitalHumanProviderError(
      "UNSUPPORTED_VIDEO_TYPE",
      `HeyGen 暂不支持 ${videoType} 类型出片`,
    )
  }
  const avatarId = typeof payload.virtualmanId === "string" ? payload.virtualmanId : null
  if (!avatarId) {
    throw new DigitalHumanProviderError(
      "MISSING_VIDEO_INPUT",
      "缺少数字人形象，无法提交 HeyGen 出片任务",
    )
  }

  const aspectRatio = payload.aspectRatio === "16:9" ? "16:9" : "9:16"
  const script = typeof payload.text === "string"
    ? payload.text
    : typeof payload.content === "string"
      ? payload.content
      : null
  const audioUrl = typeof payload.ownVoiceAudioUrl === "string" ? payload.ownVoiceAudioUrl : null
  const voiceId = typeof payload.speakerId === "string" ? payload.speakerId : null

  if (!audioUrl && (!script || !voiceId)) {
    throw new DigitalHumanProviderError(
      "MISSING_VIDEO_INPUT",
      "缺少音色或口播文案，无法提交 HeyGen 出片任务",
    )
  }

  const submitted = await createHeygenVideo({
    type: "avatar",
    avatar_id: avatarId,
    ...(audioUrl ? { audio_url: audioUrl } : { script: script!, voice_id: voiceId! }),
    aspect_ratio: aspectRatio,
    ...(typeof payload.title === "string" ? { title: payload.title } : {}),
  })

  return {
    ...submitted,
    payload: {
      ...submitted.payload,
      // 与蝉镜分支一致：把 own-voice 快照标记并入返回载荷，供重试还原音源
      ...(audioUrl ? { audioType: "audio", ownVoiceAudioUrl: audioUrl } : {}),
      ...(audioUrl && typeof payload.ownVoiceVoiceId === "string"
        ? { ownVoiceVoiceId: payload.ownVoiceVoiceId }
        : {}),
    },
  }
}
