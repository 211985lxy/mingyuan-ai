import { NextResponse, type NextRequest } from "next/server"
import { authenticateRequest } from "@/lib/user-auth"
import {
  FISH_AUDIO_MODEL_TIERS,
  getFishAudioConfig,
  isFishAudioConfigured,
  listVoiceModels,
} from "@/lib/voice/fish-audio"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * @description 处理 GET 请求：返回可用档位与音色列表
 * @param request - 请求对象
 * @returns Promise<NextResponse>
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request, { requireActivation: false })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && /CSRF/.test(error.message) ? "请求来源校验失败，请刷新页面重试" : "登录状态已失效，请重新登录" },
      { status: 401 },
    )
  }

  const configured = isFishAudioConfigured()
  const config = getFishAudioConfig()
  if (!configured) {
    return NextResponse.json({
      data: {
        configured: false,
        defaultModel: config.model,
        tiers: FISH_AUDIO_MODEL_TIERS,
        voices: [],
        degraded: true,
        reason: "未配置 FISH_AUDIO_API_KEY，配音服务不可用",
      },
    })
  }

  const selfOnly = request.nextUrl.searchParams.get("scope") === "mine"
  // 公共库默认只出中文热门音色（按使用量排序）；显式传 language 可覆盖，「我的音色」不过滤
  const language = request.nextUrl.searchParams.get("language")?.trim() || (selfOnly ? undefined : "zh")
  const result = await listVoiceModels({ selfOnly, language })

  return NextResponse.json({
    data: {
      configured: true,
      defaultModel: config.model,
      tiers: FISH_AUDIO_MODEL_TIERS,
      voices: result.items,
      degraded: result.degraded,
      reason: result.reason,
    },
  })
}
