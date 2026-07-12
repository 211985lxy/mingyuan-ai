import { env } from "@/env"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { transcribeAudioWav } from "@/lib/aliyun-asr"
import { LLMClient } from "@/lib/llm"
import { INTERNAL_BETA_LIMITS } from "@/lib/internal-beta-limits"

const ASR_PROOFREAD_MODEL = env.SCRIPT_GENERATION_MODEL || "openai/gpt-5.4"

async function correctAsrText(text: string): Promise<string> {
  const source = text.trim()
  if (source.length < 8) return source

  const llm = LLMClient.shared()
  if (!llm.available) return source

  try {
    const result = await llm.complete({
      model: ASR_PROOFREAD_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "你是中文语音识别文本校对器。",
            "只修正 ASR 常见错误：同音错字、断句、标点、明显漏字或重复字。",
            "保持口语原意和说话风格，不要润色扩写，不要总结，不要加标题。",
            "直接输出修正后的纯文本。",
          ].join("\n"),
        },
        { role: "user", content: source.slice(0, 6000) },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    })
    return result.content.trim() || source
  } catch {
    return source
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. 鉴权
    await authenticateRequest(request)

    // 2. 提取音频 Buffer
    let audioBuffer: Buffer | null = null
    const contentType = request.headers.get("content-type") || ""

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const file = formData.get("file") as File | null
      if (file) {
        const arrayBuffer = await file.arrayBuffer()
        audioBuffer = Buffer.from(arrayBuffer)
      }
    } else {
      // 默认按 application/octet-stream 或者是 binary 直接流处理
      const arrayBuffer = await request.arrayBuffer()
      audioBuffer = Buffer.from(arrayBuffer)
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json({ error: "未接收到有效的音频文件数据" }, { status: 400 })
    }
    if (audioBuffer.length > INTERNAL_BETA_LIMITS.uploadBytes) {
      return NextResponse.json(
        { error: `单个文件不能超过 ${Math.round(INTERNAL_BETA_LIMITS.uploadBytes / 1024 / 1024)}MB`, code: "INTERNAL_BETA_UPLOAD_TOO_LARGE" },
        { status: 413 },
      )
    }

    // 3. 转写
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
      const rawText = await transcribeAudioWav(audioBuffer)
      const text = await correctAsrText(rawText)
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
