import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { authenticateRequest } from "@/lib/user-auth"
import {
  apiRequestErrorResponse,
  parseJsonBody,
  parseQuery,
} from "@/lib/api-contract"
import {
  FishAudioError,
  FISH_AUDIO_MAX_TEXT_LENGTH,
  type FishAudioFormat,
  synthesizeSpeech,
} from "@/lib/voice/fish-audio"

export const runtime = "nodejs"
export const maxDuration = 120

const ttsBodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "请先输入要配音的文案")
    .max(FISH_AUDIO_MAX_TEXT_LENGTH, `单次配音最多 ${FISH_AUDIO_MAX_TEXT_LENGTH} 字，请分段后再试`),
  voiceId: z.string().trim().max(64).nullish(),
  model: z.string().trim().max(64).nullish(),
  format: z.enum(["mp3", "wav", "pcm", "opus"]).nullish(),
  speed: z.number().min(0.5).max(2).nullish(),
  volume: z.number().min(-20).max(20).nullish(),
})

const ttsQuerySchema = z.object({})

/**
 * @description 处理 POST 请求：把文案合成为语音字节流返回
 * @param request - 请求对象
 * @returns Promise<NextResponse>
 */
export async function POST(request: NextRequest) {
  let user
  try {
    user = await authenticateRequest(request, { requireActivation: false })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && /CSRF/.test(error.message)
            ? "请求来源校验失败，请刷新页面重试"
            : "登录状态已失效，请重新登录",
      },
      { status: 401 },
    )
  }
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 })

  try {
    const body = await parseJsonBody(request, ttsBodySchema, { maxBytes: 128 * 1024 })
    const result = await synthesizeSpeech({
      text: body.text,
      voiceId: body.voiceId ?? null,
      model: body.model ?? null,
      format: (body.format ?? "mp3") as FishAudioFormat,
      speed: body.speed ?? undefined,
      volume: body.volume ?? undefined,
    })

    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, no-store",
        "X-Voice-Model": result.model,
        "X-Voice-Chars": String(result.charCount),
      },
    })
  } catch (error) {
    const contractError = apiRequestErrorResponse(request, error)
    if (contractError) return contractError
    if (error instanceof FishAudioError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error("[api/voice/tts] 合成失败:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "配音服务暂时不可用，请稍后重试" }, { status: 502 })
  }
}

/**
 * @description 处理 GET 请求：返回当前配音能力配置，便于前端提示上限
 * @param request - 请求对象
 * @returns Promise<NextResponse>
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request, { requireActivation: false })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && /CSRF/.test(error.message)
            ? "请求来源校验失败，请刷新页面重试"
            : "登录状态已失效，请重新登录",
      },
      { status: 401 },
    )
  }
  parseQuery(request, ttsQuerySchema)
  return NextResponse.json({
    data: { maxTextLength: FISH_AUDIO_MAX_TEXT_LENGTH, formats: ["mp3", "wav", "pcm", "opus"] },
  })
}
