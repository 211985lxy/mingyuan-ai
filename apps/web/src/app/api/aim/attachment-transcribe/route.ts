import { NextRequest, NextResponse } from "next/server"

import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseJsonRecord, apiRequestErrorResponse } from "@/lib/api-contract"
import { generateSignedUrl, isManagedOssUrl } from "@/lib/oss"
import { transcribeRecordingFile } from "@/lib/aliyun-asr"

export const dynamic = "force-dynamic"
// 录音文件识别含提交+轮询；对齐 meeting-recording/process-video 的时长。
export const maxDuration = 120

/**
 * @description 聊天音频附件自动转写：前端直传 OSS 拿 URL → 阿里云录音文件识别
 *  → 返回转写文本，由前端并入该附件的 content 随消息发送。
 * 复用 meeting-recording 的安全与调用模式（isManagedOssUrl → 签名 URL）。
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request)

    let body: { audioUrl?: string }
    try {
      body = (await parseJsonRecord(request)) as { audioUrl?: string }
    } catch (error) {
      return apiRequestErrorResponse(request, error) ?? NextResponse.json(
        { error: "请求体不是合法 JSON" },
        { status: 400 },
      )
    }

    const audioUrl = (body.audioUrl ?? "").trim()
    if (!audioUrl) {
      return NextResponse.json({ error: "缺少 audioUrl：请先上传音频到存储" }, { status: 400 })
    }

    const readableUrl = isManagedOssUrl(audioUrl) ? generateSignedUrl(audioUrl, 3600) : audioUrl
    const transcription = await transcribeRecordingFile(readableUrl)
    const text = transcription?.readableTranscript ?? ""

    if (!text.trim()) {
      return NextResponse.json({ error: "音频中没有识别出语音内容" }, { status: 422 })
    }
    return NextResponse.json({ text })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "音频转写失败" },
      { status: 502 },
    )
  }
}
