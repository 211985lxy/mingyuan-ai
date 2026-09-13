import {
  cloneFastAvatar as cloneChanjingFastAvatar,
  createDigitalHumanVideo,
  deleteCustomisedPerson,
  getAvatarCloneTaskInfo,
  getVideoTaskInfo,
  isChanjingConfigured,
  ChanjingError,
} from "@/lib/chanjing"
import { createDigitalHumanVideoFromAudio } from "@/lib/chanjing-audio"
import {
  createVideo as createHeygenVideo,
  getVideo as getHeygenVideo,
  isHeygenConfigured,
  mapHeygenVideoToTaskResult,
  HeygenError,
} from "@/lib/heygen"
import {
  cloneFastAvatar as cloneShanjianFastAvatar,
  cloneImageAvatar as cloneShanjianImageAvatar,
  cloneProfessionalAvatar as cloneShanjianProfessionalAvatar,
  deleteAsset as deleteShanjianAsset,
  generateRawVideo,
  getTaskInfo as getShanjianTaskInfo,
  ShanjianError,
  type ShanjianSubmitResult,
} from "@/lib/shanjian"
import { env } from "@/env"

export type DigitalHumanProvider = "chanjing" | "shanjian" | "heygen"

export function isDigitalHumanProvider(value: unknown): value is DigitalHumanProvider {
  return value === "chanjing" || value === "shanjian" || value === "heygen"
}

export function normalizeDigitalHumanProvider(value: unknown): DigitalHumanProvider {
  if (value === "shanjian" || value === "heygen") return value
  return "chanjing"
}

export class DigitalHumanProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message)
    this.name = "DigitalHumanProviderError"
  }
}

export function getDigitalHumanProvider(): DigitalHumanProvider {
  const configured = env.DIGITAL_HUMAN_PROVIDER
  if (configured === "chanjing" || configured === "shanjian" || configured === "heygen") return configured
  return "chanjing"
}

export function normalizeDigitalHumanAuthorizationText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim()
}

export function matchesDigitalHumanAuthorizationText(
  provided: unknown,
  expected: string,
): boolean {
  return typeof provided === "string"
    && normalizeDigitalHumanAuthorizationText(provided) === normalizeDigitalHumanAuthorizationText(expected)
}

/**
 * 授权文案中的声明人姓名占位符。
 *
 * 供应商的授权话术要求声明人念自己的**真实姓名**（如「我 XXX 特此声明，授权…」），
 * 因此文案对每个人不同，不能在全平台写死一段。配置里以 `{name}` 标注该位置。
 */
export const DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER = "{name}"

/**
 * 把配置的授权文案模板实例化为某一位声明人的原文。
 *
 * 未包含占位符时原样返回（兼容「仅账号持有人本人克隆」的单一文案形态）；
 * 包含占位符但拿不到姓名时 fail-closed——宁可不放行，也不能让用户念一段
 * 写着别人姓名的声明。
 */
export function buildDigitalHumanAuthorizationText(
  template: string,
  userName?: string | null,
): string {
  const normalized = normalizeDigitalHumanAuthorizationText(template)
  if (!normalized.includes(DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER)) return normalized

  const name = typeof userName === "string" ? userName.replace(/\s+/g, " ").trim() : ""
  if (!name) {
    throw new DigitalHumanProviderError(
      "AUTH_NAME_REQUIRED",
      "授权文案含 {name} 占位符，需先完善账号姓名后才能生成授权原文",
    )
  }
  return normalizeDigitalHumanAuthorizationText(
    normalized.replaceAll(DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER, name),
  )
}

/**
 * 返回当前供应商要求用户在授权视频中逐字朗读的原文（按声明人实例化）。
 *
 * 这段文字是供应商账户配置的一部分，不能从品牌名、用户输入或前端
 * 拼接得到。未配置时直接阻止授权视频提交，避免将错误文案送到供应商。
 */
export function getDigitalHumanAuthorizationText(
  provider: DigitalHumanProvider = getDigitalHumanProvider(),
  userName?: string | null,
): string {
  const configured = provider === "chanjing"
    ? env.CHANJING_AUTH_TEXT
    : env.SHANJIAN_AUTH_TEXT
  const text = configured ? normalizeDigitalHumanAuthorizationText(configured) : ""
  if (!text) {
    throw new DigitalHumanProviderError(
      "AUTH_TEXT_NOT_CONFIGURED",
      `${provider === "chanjing" ? "蝉镜" : "闪剪"}授权文案暂未配置，请联系管理员`,
    )
  }
  return buildDigitalHumanAuthorizationText(text, userName)
}

export function hasExactDigitalHumanAuthorizationText(
  provided: unknown,
  provider: DigitalHumanProvider = getDigitalHumanProvider(),
  userName?: string | null,
): boolean {
  try {
    return matchesDigitalHumanAuthorizationText(provided, getDigitalHumanAuthorizationText(provider, userName))
  } catch {
    return false
  }
}

export function isDigitalHumanConfigured(): boolean {
  const provider = getDigitalHumanProvider()
  if (provider === "chanjing") return isChanjingConfigured()
  if (provider === "heygen") return isHeygenConfigured()
  return Boolean(env.SHANJIAN_APP_KEY)
}

function wrapError(error: unknown): DigitalHumanProviderError {
  if (error instanceof DigitalHumanProviderError) return error
  if (error instanceof ChanjingError || error instanceof ShanjianError || error instanceof HeygenError) {
    return new DigitalHumanProviderError(error.code, error.message, error.requestId)
  }
  if (error instanceof Error) {
    return new DigitalHumanProviderError("PROVIDER_ERROR", error.message)
  }
  return new DigitalHumanProviderError("PROVIDER_ERROR", "数字人服务异常，请稍后重试")
}

export async function cloneFastAvatarForProvider(
  provider: DigitalHumanProvider,
  input: {
    name: string
    videoUrl: string
    authVideoUrl: string
    authText: string
  },
): Promise<string> {
  try {
    if (provider === "chanjing") {
      return await cloneChanjingFastAvatar(input)
    }
    return await cloneShanjianFastAvatar({
      videoUrl: input.videoUrl,
      authVideoUrl: input.authVideoUrl,
      authText: input.authText,
    })
  } catch (error) {
    throw wrapError(error)
  }
}

export async function cloneFastAvatar(input: {
  name: string
  videoUrl: string
  authVideoUrl: string
  authText: string
}): Promise<string> {
  return cloneFastAvatarForProvider(getDigitalHumanProvider(), input)
}

export async function cloneProfessionalAvatarForProvider(
  provider: DigitalHumanProvider,
  input: {
    videoUrl: string
    authVideoUrl: string
    authText: string
  },
): Promise<string> {
  if (provider === "chanjing") {
    throw new DigitalHumanProviderError(
      "UNSUPPORTED_CLONE_TYPE",
      "蝉镜暂不支持专业克隆，请使用极速克隆",
    )
  }
  try {
    return await cloneShanjianProfessionalAvatar(input)
  } catch (error) {
    throw wrapError(error)
  }
}

export async function cloneProfessionalAvatar(input: {
  videoUrl: string
  authVideoUrl: string
  authText: string
}): Promise<string> {
  return cloneProfessionalAvatarForProvider(getDigitalHumanProvider(), input)
}

export async function cloneImageAvatarForProvider(
  provider: DigitalHumanProvider,
  input: {
    imageUrl: string
    authVideoUrl: string
    authText: string
  },
): Promise<string> {
  if (provider === "chanjing") {
    throw new DigitalHumanProviderError(
      "UNSUPPORTED_CLONE_TYPE",
      "蝉镜暂不支持图片克隆，请上传训练视频",
    )
  }
  try {
    return await cloneShanjianImageAvatar(input)
  } catch (error) {
    throw wrapError(error)
  }
}

export async function cloneImageAvatar(input: {
  imageUrl: string
  authVideoUrl: string
  authText: string
}): Promise<string> {
  return cloneImageAvatarForProvider(getDigitalHumanProvider(), input)
}

export async function deleteAvatarAssetForProvider(
  provider: DigitalHumanProvider,
  externalId: string,
): Promise<void> {
  try {
    if (provider === "chanjing") {
      await deleteCustomisedPerson(externalId)
      return
    }
    await deleteShanjianAsset(externalId)
  } catch (error) {
    throw wrapError(error)
  }
}

export async function deleteAvatarAsset(externalId: string): Promise<void> {
  return deleteAvatarAssetForProvider(getDigitalHumanProvider(), externalId)
}

export async function getAvatarCloneStatus(taskId: string) {
  return getAvatarCloneStatusForProvider(getDigitalHumanProvider(), taskId)
}

export async function getAvatarCloneStatusForProvider(
  provider: DigitalHumanProvider,
  taskId: string,
) {
  try {
    if (provider === "chanjing") {
      return await getAvatarCloneTaskInfo(taskId)
    }
    return await getShanjianTaskInfo(taskId)
  } catch (error) {
    throw wrapError(error)
  }
}

export async function getVideoTaskStatus(taskId: string) {
  return getVideoTaskStatusForProvider(getDigitalHumanProvider(), taskId)
}

export async function getVideoTaskStatusForProvider(
  provider: DigitalHumanProvider,
  taskId: string,
) {
  try {
    if (provider === "chanjing") {
      return await getVideoTaskInfo(taskId)
    }
    if (provider === "heygen") {
      return mapHeygenVideoToTaskResult(await getHeygenVideo(taskId))
    }
    return await getShanjianTaskInfo(taskId)
  } catch (error) {
    throw wrapError(error)
  }
}

export async function generateDemoVideo(input: {
  virtualmanId: string
  speakerId: string
  text: string
}): Promise<ShanjianSubmitResult> {
  try {
    if (getDigitalHumanProvider() === "chanjing") {
      return await createDigitalHumanVideo({
        personId: input.virtualmanId,
        audioManId: input.speakerId,
        text: input.text,
      })
    }
    return await generateRawVideo({
      virtualmanId: input.virtualmanId,
      text: input.text,
      speakerId: input.speakerId,
    })
  } catch (error) {
    throw wrapError(error)
  }
}

const CHANJING_VIDEO_TYPES = new Set([
  "virtualman_broadcast",
  "virtualman_video",
  "custom_virtualman_broadcast",
])

export async function submitVideoToProvider(
  provider: DigitalHumanProvider,
  videoType: string,
  payload: Record<string, unknown>,
): Promise<ShanjianSubmitResult> {
  try {
    if (provider === "heygen") {
      return await submitHeygenVideo(videoType, payload)
    }
    if (provider === "chanjing") {
      return await submitChanjingVideo(videoType, payload)
    }
    const { submitToShanjian } = await import("@/lib/shanjian-submit")
    return await submitToShanjian(videoType, payload)
  } catch (error) {
    throw wrapError(error)
  }
}

/**
 * 蝉镜出片提交。
 *
 * 两种驱动二选一：
 * - 音频驱动（自有语音）：传 wav_url，不需要蝉镜音色与文案
 * - 脚本驱动：传 tts 文本 + 蝉镜音色
 */
async function submitChanjingVideo(
  videoType: string,
  payload: Record<string, unknown>,
): Promise<ShanjianSubmitResult> {
  if (!CHANJING_VIDEO_TYPES.has(videoType)) {
    throw new DigitalHumanProviderError(
      "UNSUPPORTED_VIDEO_TYPE",
      `蝉镜暂不支持 ${videoType} 类型出片`,
    )
  }
  const personId = typeof payload.virtualmanId === "string" ? payload.virtualmanId : null
  if (!personId) {
    throw new DigitalHumanProviderError(
      "MISSING_VIDEO_INPUT",
      "缺少数字人形象，无法提交蝉镜出片任务",
    )
  }
  const aspectRatio = payload.aspectRatio === "16:9" ? "16:9" : "9:16"
  const width = aspectRatio === "16:9" ? 1920 : 1080
  const height = aspectRatio === "16:9" ? 1080 : 1920

  const ownVoiceAudioUrl = typeof payload.ownVoiceAudioUrl === "string"
    ? payload.ownVoiceAudioUrl
    : null
  if (ownVoiceAudioUrl) {
    const submitted = await createDigitalHumanVideoFromAudio({
      wavUrl: ownVoiceAudioUrl,
      personId,
      figureType: typeof payload.figureType === "string" ? payload.figureType : "whole_body",
      personWidth: width,
      personHeight: height,
    })
    // 落库的是本函数返回的 payload（而非调用方构造的那份），重试需要据此还原音源，
    // 因此把 own-voice 快照标记并入返回载荷。
    return {
      ...submitted,
      payload: {
        ...submitted.payload,
        audioType: "audio",
        ownVoiceAudioUrl,
        ...(typeof payload.ownVoiceVoiceId === "string"
          ? { ownVoiceVoiceId: payload.ownVoiceVoiceId }
          : {}),
      },
    }
  }

  const audioManId = typeof payload.speakerId === "string" ? payload.speakerId : null
  const text = typeof payload.text === "string"
    ? payload.text
    : typeof payload.content === "string"
      ? payload.content
      : null
  if (!audioManId || !text) {
    throw new DigitalHumanProviderError(
      "MISSING_VIDEO_INPUT",
      "缺少音色或口播文案，无法提交蝉镜出片任务",
    )
  }
  return await createDigitalHumanVideo({ personId, audioManId, text, width, height })
}

const HEYGEN_VIDEO_TYPES = new Set([
  "virtualman_broadcast",
  "virtualman_video",
  "custom_virtualman_broadcast",
])

/**
 * HeyGen v3 出片提交。
 *
 * 两种驱动二选一（与 /v3/videos 的契约一致）：
 * - 音频驱动：载荷里有 ownVoiceAudioUrl 时传 audio_url，脚本不参与（口型跟音频）
 * - 脚本驱动：传 script + voice_id，由 HeyGen 侧 TTS
 * avatar_id 必填；缺失或类型不支持时 fail-closed，不提交半个任务。
 */
async function submitHeygenVideo(
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
