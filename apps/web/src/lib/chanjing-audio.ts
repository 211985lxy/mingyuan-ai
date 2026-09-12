import { request, type ChanjingSubmitResult } from "./chanjing"
import type {
  ChanjingAudioTaskState,
  ChanjingCommonAudioMan,
  ChanjingCommonDigitalPerson,
} from "@/types/chanjing"

// ─── 公共资源与独立 TTS（OpenAPI：公共资源 / 语音生成）──────

export async function listCommonAudio(page = 1, size = 20): Promise<ChanjingCommonAudioMan[]> {
  const data = await request<{ list: ChanjingCommonAudioMan[] }>("GET", "/list_common_audio", {
    params: { page: String(page), size: String(size) },
    timeoutMs: 10_000,
  })
  return data.list ?? []
}

export async function listCommonDigitalPersons(
  page = 1,
  size = 20,
): Promise<ChanjingCommonDigitalPerson[]> {
  const data = await request<{ list: ChanjingCommonDigitalPerson[] }>("GET", "/list_common_dp", {
    params: { page: String(page), size: String(size) },
    timeoutMs: 10_000,
  })
  return data.list ?? []
}

export async function createAudioTask(input: {
  audioManId: string
  speed?: number
  text: string
  plainText?: string
}): Promise<string> {
  // OpenTextToSpeechRes：data 是对象 { task_id }，不是裸字符串
  const data = await request<{ task_id: string }>("POST", "/create_audio_task", {
    body: {
      audio_man: input.audioManId,
      speed: input.speed ?? 1,
      text: {
        text: input.text,
        plain_text: input.plainText ?? input.text,
      },
    },
    timeoutMs: 30_000,
  })
  return data.task_id
}

export async function getAudioTaskState(taskId: string): Promise<ChanjingAudioTaskState> {
  return request<ChanjingAudioTaskState>("POST", "/audio_task_state", {
    body: { task_id: taskId },
    timeoutMs: 10_000,
  })
}

/**
 * 用已完成的外部音频（wav_url）驱动数字人合成视频。
 * 与 chanjing.ts 的 createDigitalHumanVideo（tts 型）不同，audio 型必须由
 * 调用方先通过 create_audio_task 产出音频 URL；画布尺寸为顶层字段。
 */
export async function createDigitalHumanVideoFromAudio(input: {
  personId: string
  figureType: string
  personWidth: number
  personHeight: number
  wavUrl: string
  volume?: number
  screenWidth?: number
  screenHeight?: number
}): Promise<ChanjingSubmitResult> {
  const screenWidth = input.screenWidth ?? input.personWidth
  const screenHeight = input.screenHeight ?? input.personHeight
  const body = {
    person: {
      id: input.personId,
      figure_type: input.figureType,
      width: input.personWidth,
      height: input.personHeight,
    },
    audio: {
      type: "audio",
      wav_url: input.wavUrl,
      volume: input.volume ?? 100,
    },
    screen_width: screenWidth,
    screen_height: screenHeight,
  }

  const taskId = await request<string>("POST", "/create_video", {
    body,
    timeoutMs: 30_000,
  })

  return { taskId, payload: { provider: "chanjing", endpoint: "/create_video", ...body } }
}
