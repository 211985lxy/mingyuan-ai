import { NextResponse, type NextRequest } from "next/server"
import { authenticateRequest } from "@/lib/user-auth"
import { cloneVoiceModel } from "@/lib/voice/fish-audio"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_AUDIO_BYTES = 20 * 1024 * 1024

/**
 * @description 处理 POST 请求：接收用户录音/上传的音频，转发 Fish Audio 克隆私有音色
 * @param request - 请求对象（multipart/form-data：title、consent、file）
 * @returns Promise<NextResponse>
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request, { requireActivation: false })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && /CSRF/.test(error.message) ? "请求来源校验失败，请刷新页面重试" : "登录状态已失效，请重新登录" },
      { status: 401 },
    )
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "请求格式有误" }, { status: 400 })

  const title = String(form.get("title") ?? "").trim()
  if (!title) return NextResponse.json({ error: "请先给音色起个名字" }, { status: 400 })
  if (form.get("consent") !== "true") {
    return NextResponse.json({ error: "请先确认声音授权后再提交克隆" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请先录制或上传一段音频" }, { status: 400 })
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "音频不能超过 20MB，建议 10–60 秒的清晰朗读" }, { status: 400 })
  }

  try {
    const { id } = await cloneVoiceModel({
      title,
      audio: file,
      filename: file.name || "voice-recording.webm",
      description: "用户自克隆音色（来自语音工坊）",
    })
    return NextResponse.json({ data: { voiceId: id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "克隆失败，请稍后重试"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
