import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseJsonBody, parseQuery } from "@/lib/api-contract"
import { deleteSynthesis, listSyntheses, persistSynthesis, VOICE_MAX_TOTAL_TEXT_LENGTH } from "@/lib/voice/history"

export const runtime = "nodejs"
export const maxDuration = 300

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

const deleteBodySchema = z.object({
  id: z.string().trim().min(1),
})

/** 客户端分段拼好的整段音频上限（约 12000 字 @128kbps） */
const MAX_AUDIO_BYTES = 40 * 1024 * 1024

/**
 * GET /api/voice/history
 * 当前用户的语音合成历史（含全文与短期签名音频地址），倒序分页。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request, { requireActivation: false })
    if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 })

    const { page = 1, pageSize = 20 } = parseQuery(request, historyQuerySchema)
    const { items, total } = await listSyntheses(user.id, page, pageSize)

    return NextResponse.json({
      data: {
        items,
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[api/voice/history] 读取失败:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "配音历史暂时不可用，请稍后重试" }, { status: 500 })
  }
}

/**
 * POST /api/voice/history
 * 导入一段客户端分段合成并拼接好的完整配音（multipart）：音频转存 OSS + 全文落库。
 * 字段：text, model, voiceId?, segments, audio(File, mp3)。
 */
export async function POST(request: NextRequest) {
  let user
  try {
    user = await authenticateRequest(request, { requireActivation: false })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 })
  }
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 })

  try {
    const form = await request.formData()
    const audio = form.get("audio")
    const text = String(form.get("text") ?? "").trim()
    const model = String(form.get("model") ?? "").trim()
    const voiceId = String(form.get("voiceId") ?? "").trim()
    const segments = Number(form.get("segments") ?? "1")

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "缺少音频文件" }, { status: 400 })
    }
    if (!text) return NextResponse.json({ error: "缺少文案内容" }, { status: 400 })
    if (text.length > VOICE_MAX_TOTAL_TEXT_LENGTH) {
      return NextResponse.json({ error: `文案超出 ${VOICE_MAX_TOTAL_TEXT_LENGTH} 字上限` }, { status: 400 })
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "音频文件过大" }, { status: 413 })
    }
    if (!model || !Number.isFinite(segments) || segments < 1) {
      return NextResponse.json({ error: "合成参数不完整" }, { status: 400 })
    }

    const buffer = Buffer.from(await audio.arrayBuffer())
    const recordId = await persistSynthesis({
      userId: user.id,
      text,
      model,
      voiceId: voiceId || null,
      format: "mp3",
      audio: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      segments: Math.floor(segments),
    })
    return NextResponse.json({ data: { recordId } })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[api/voice/history] 导入失败:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "保存配音失败，请稍后重试" }, { status: 500 })
  }
}

/**
 * DELETE /api/voice/history
 * 删除当前用户的一条合成记录；OSS 上的音频对象尽力清理。
 */
export async function DELETE(request: NextRequest) {
  let user
  try {
    user = await authenticateRequest(request, { requireActivation: false })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 })
  }
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 })

  try {
    const body = await parseJsonBody(request, deleteBodySchema, { maxBytes: 4096 })
    const deleted = await deleteSynthesis(user.id, body.id)
    if (!deleted) {
      return NextResponse.json({ error: "记录不存在或无权删除" }, { status: 404 })
    }
    return NextResponse.json({ data: { deleted: true } })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[api/voice/history] 删除失败:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 })
  }
}
