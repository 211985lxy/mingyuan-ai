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
      // 同时支持 query.mode（?mode=interview）与 body form 字段 mode
      const queryMode = request.nextUrl.searchParams.get("mode")
      // body mode 解析已随 readAsrAudioInput 重构移除，仅保留 query.mode 入口
      const bodyMode: string | null = null
      const isInterviewMode = (queryMode ?? bodyMode ?? "") === "interview"

      const rawText = await transcribeAudioWav(audioInput.audioBuffer)
      const coreText = await polishTranscript(rawText)

      if (isInterviewMode) {
        const wrappedText =
          "【采访模式】这是采访模式逐字稿，已准备好接续老板说明书采访技能。在 AIM Chat 中回复「确认应用」即可启动写入流程。\n\n"
          + coreText
          + "\n\n【采访模式提示】逐字稿结束。请在 AIM Chat 中回复「确认应用」以将结构化六维画像写入老板说明书。"
        return NextResponse.json({ text: wrappedText, readyForInterviewSkill: true, mode: "interview" })
      }

      const text = coreText
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
