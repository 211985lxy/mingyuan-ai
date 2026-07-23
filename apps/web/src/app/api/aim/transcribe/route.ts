import { env } from "@/env"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { transcribeAudioWav } from "@/lib/aliyun-asr"
import { polishTranscript } from "@/lib/transcript-polish"
import { readAsrAudioInput } from "@/features/aim/services/transcribe-audio"

// api-inventory: input=multipart
// api-inventory: upload-limit=internal-beta

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request)

    const audioInput = await readAsrAudioInput(request)
    if (!audioInput.ok) {
      return NextResponse.json(audioInput.error, { status: audioInput.status })
    }

    const hasAliyun =
      (env.ALIYUN_VIAPI_ACCESS_KEY_ID || env.OSS_ACCESS_KEY_ID) &&
      (env.ALIYUN_VIAPI_ACCESS_KEY_SECRET || env.OSS_ACCESS_KEY_SECRET) &&
      env.ALIYUN_NLS_APP_KEY

    if (!hasAliyun) {
      console.warn("[aim/transcribe] 阿里云语音交互配置缺失，请检查环境变量 ALIYUN_NLS_APP_KEY 等。")
      return NextResponse.json(
        { error: "语音转写服务未配置，请联系管理员配置阿里云 ASR 环境变量" },
        { status: 503 }
      )
    }

    try {
      const rawText = await transcribeAudioWav(audioInput.audioBuffer)
      const text = await polishTranscript(rawText)
      return NextResponse.json({ text })
    } catch (asrError) {
      console.error("[aim/transcribe] Aliyun ASR Error:", asrError)
      return NextResponse.json(
        { error: asrError instanceof Error ? asrError.message : "语音识别失败" },
        { status: 502 } // 网关错误（阿里云调用失败）
      )
    }
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error("[aim/transcribe] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "服务端转写失败" },
      { status: 500 }
    )
  }
}
