import {
  cloneFastAvatar as cloneChanjingFastAvatar,
  createDigitalHumanVideo,
  deleteCustomisedPerson,
  getAvatarCloneTaskInfo,
  getVideoTaskInfo,
  isChanjingConfigured,
  ChanjingError,
} from "@/lib/chanjing"
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

export type DigitalHumanProvider = "chanjing" | "shanjian"

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
  if (configured === "chanjing" || configured === "shanjian") return configured
  if (isChanjingConfigured()) return "chanjing"
  return "shanjian"
}

export function isDigitalHumanConfigured(): boolean {
  const provider = getDigitalHumanProvider()
  if (provider === "chanjing") return isChanjingConfigured()
  return Boolean(env.SHANJIAN_APP_KEY)
}

function wrapError(error: unknown): DigitalHumanProviderError {
  if (error instanceof DigitalHumanProviderError) return error
  if (error instanceof ChanjingError || error instanceof ShanjianError) {
    return new DigitalHumanProviderError(error.code, error.message, error.requestId)
  }
  if (error instanceof Error) {
    return new DigitalHumanProviderError("PROVIDER_ERROR", error.message)
  }
  return new DigitalHumanProviderError("PROVIDER_ERROR", "数字人服务异常，请稍后重试")
}

export async function cloneFastAvatar(input: {
  name: string
  videoUrl: string
  authVideoUrl: string
  authText: string
}): Promise<string> {
  try {
    if (getDigitalHumanProvider() === "chanjing") {
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

export async function cloneProfessionalAvatar(input: {
  videoUrl: string
  authVideoUrl: string
  authText: string
}): Promise<string> {
  if (getDigitalHumanProvider() === "chanjing") {
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

export async function cloneImageAvatar(input: {
  imageUrl: string
  authVideoUrl: string
  authText: string
}): Promise<string> {
  if (getDigitalHumanProvider() === "chanjing") {
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

export async function deleteAvatarAsset(externalId: string): Promise<void> {
  try {
    if (getDigitalHumanProvider() === "chanjing") {
      await deleteCustomisedPerson(externalId)
      return
    }
    await deleteShanjianAsset(externalId)
  } catch (error) {
    throw wrapError(error)
  }
}

export async function getAvatarCloneStatus(taskId: string) {
  try {
    if (getDigitalHumanProvider() === "chanjing") {
      return await getAvatarCloneTaskInfo(taskId)
    }
    return await getShanjianTaskInfo(taskId)
  } catch (error) {
    throw wrapError(error)
  }
}

export async function getVideoTaskStatus(taskId: string) {
  try {
    if (getDigitalHumanProvider() === "chanjing") {
      return await getVideoTaskInfo(taskId)
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
  videoType: string,
  payload: Record<string, unknown>,
): Promise<ShanjianSubmitResult> {
  try {
    if (getDigitalHumanProvider() === "chanjing") {
      if (!CHANJING_VIDEO_TYPES.has(videoType)) {
        throw new DigitalHumanProviderError(
          "UNSUPPORTED_VIDEO_TYPE",
          `蝉镜暂不支持 ${videoType} 类型出片`,
        )
      }
      const personId = typeof payload.virtualmanId === "string" ? payload.virtualmanId : null
      const audioManId = typeof payload.speakerId === "string" ? payload.speakerId : null
      const text = typeof payload.text === "string"
        ? payload.text
        : typeof payload.content === "string"
          ? payload.content
          : null
      if (!personId || !audioManId || !text) {
        throw new DigitalHumanProviderError(
          "MISSING_VIDEO_INPUT",
          "缺少数字人、音色或口播文案，无法提交蝉镜出片任务",
        )
      }
      return await createDigitalHumanVideo({ personId, audioManId, text })
    }

    const { submitToShanjian } = await import("@/lib/shanjian-submit")
    return await submitToShanjian(videoType, payload)
  } catch (error) {
    throw wrapError(error)
  }
}
