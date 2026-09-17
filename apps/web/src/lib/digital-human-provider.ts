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
import { HypitError, isHypitConfigured } from "@/lib/hypit"
import { HypitTemplateError } from "@/lib/hypit-template"
import { env } from "@/env"
import { DigitalHumanProviderError } from "./digital-human-provider-error"
import { submitHeygenVideo } from "./heygen-submit"
import { resolveHypitTaskResult, submitHypitVideo } from "./hypit-submit"

// 错误类型已抽到 `digital-human-provider-error.ts`（子模块也要抛它，留在会造成循环
// import）；这里转出，保持既有 `@/lib/digital-human-provider` 的导入路径不变。
export { DigitalHumanProviderError } from "./digital-human-provider-error"

export type DigitalHumanProvider = "chanjing" | "shanjian" | "heygen" | "hypit"

export function isDigitalHumanProvider(value: unknown): value is DigitalHumanProvider {
  return value === "chanjing" || value === "shanjian" || value === "heygen" || value === "hypit"
}

export function normalizeDigitalHumanProvider(value: unknown): DigitalHumanProvider {
  if (value === "shanjian" || value === "heygen" || value === "hypit") return value
  return "chanjing"
}

export function getDigitalHumanProvider(): DigitalHumanProvider {
  const configured = env.DIGITAL_HUMAN_PROVIDER
  if (configured === "chanjing" || configured === "shanjian" || configured === "heygen" || configured === "hypit") {
    return configured
  }
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
 * 配置里以 `{name}` 标注该位置。
 */
export const DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER = "{name}"

/**
 * 姓名位展示文本：姓名不做校验、不从账号读取（2026-09-15 决策）。
 * 声明人自己知道名字，录时念自己的即可；避免拼音缩写账号渲染出「我 lxy 特此声明」，
 * 也不再把「先完善账号姓名」的压力转嫁给客户。
 */
export const DIGITAL_HUMAN_AUTH_NAME_DISPLAY = "（您的姓名）"

/**
 * 模板实例化为对所有声明人通用的展示原文：姓名位统一为占位文本。
 * 未包含占位符时原样返回（兼容单一文案形态）。
 */
export function buildDigitalHumanAuthorizationText(template: string): string {
  const normalized = normalizeDigitalHumanAuthorizationText(template)
  if (!normalized.includes(DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER)) return normalized
  return normalizeDigitalHumanAuthorizationText(
    normalized.replaceAll(DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER, DIGITAL_HUMAN_AUTH_NAME_DISPLAY),
  )
}

/**
 * 返回当前供应商要求用户在授权视频中逐字朗读的原文（姓名位为通用占位）。
 *
 * 这段文字是供应商账户配置的一部分，不能从品牌名、用户输入或前端拼接得到。
 * 未配置时直接阻止授权视频提交，避免将错误文案送到供应商。
 */
export function getDigitalHumanAuthorizationText(
  provider: DigitalHumanProvider = getDigitalHumanProvider(),
): string {
  // Hypit 是自建渲染后端，不存在「供应商要求用户朗读授权原文」这套概念。
  // 显式拒绝，避免落到下方闪剪分支去读 SHANJIAN_AUTH_TEXT。
  if (provider === "hypit") {
    throw new DigitalHumanProviderError(
      "AUTH_TEXT_NOT_APPLICABLE",
      "本机渲染服务不涉及形象授权文案",
    )
  }
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
  return buildDigitalHumanAuthorizationText(text)
}

export function hasExactDigitalHumanAuthorizationText(
  provided: unknown,
  provider: DigitalHumanProvider = getDigitalHumanProvider(),
): boolean {
  try {
    return matchesDigitalHumanAuthorizationText(provided, getDigitalHumanAuthorizationText(provider))
  } catch {
    return false
  }
}

export function isDigitalHumanConfigured(): boolean {
  const provider = getDigitalHumanProvider()
  if (provider === "chanjing") return isChanjingConfigured()
  if (provider === "heygen") return isHeygenConfigured()
  if (provider === "hypit") return isHypitConfigured()
  return Boolean(env.SHANJIAN_APP_KEY)
}

function wrapError(error: unknown): DigitalHumanProviderError {
  if (error instanceof DigitalHumanProviderError) return error
  // 变量缺值要原样带出 `MISSING_VARIABLE`，否则调用方无法区分「模板没填」和「服务异常」。
  if (error instanceof HypitTemplateError) {
    return new DigitalHumanProviderError(error.code, error.message)
  }
  if (
    error instanceof ChanjingError
    || error instanceof ShanjianError
    || error instanceof HeygenError
    || error instanceof HypitError
  ) {
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
  /**
   * 仅 Hypit 用：本次任务要的比例。一次 build 会吐出三比例的多个产物，
   * 决定 `videoUrl` 取哪一条。不传则取渲染顺序的第一条。
   */
  options: { aspectRatio?: "9:16" | "16:9" | "1:1" } = {},
) {
  try {
    if (provider === "chanjing") {
      return await getVideoTaskInfo(taskId)
    }
    if (provider === "heygen") {
      return mapHeygenVideoToTaskResult(await getHeygenVideo(taskId))
    }
    if (provider === "hypit") {
      return await resolveHypitTaskResult(taskId, options.aspectRatio)
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
  figureType?: string | null
  driveMode?: "random" | null
}): Promise<ShanjianSubmitResult> {
  try {
    if (getDigitalHumanProvider() === "chanjing") {
      return await createDigitalHumanVideo({
        personId: input.virtualmanId,
        audioManId: input.speakerId,
        text: input.text,
        figureType: input.figureType ?? null,
        driveMode: input.driveMode ?? null,
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
    if (provider === "hypit") {
      return await submitHypitVideo(payload)
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
      // 缺省 whole_body 是自建形象的既有契约（公有形象由前端显式传入形态）
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
  // 形态必须由调用方按实际形象传（公共形象各有形态列表，且并非都有 whole_body）；
  // 缺失时交给供应商判定，不在此硬编码默认值以免传入该形象不具备的形态。
  return await createDigitalHumanVideo({
    personId,
    audioManId,
    text,
    width,
    height,
    figureType: typeof payload.figureType === "string" ? payload.figureType : null,
    driveMode: payload.driveMode === "random" ? "random" : null,
  })
}
