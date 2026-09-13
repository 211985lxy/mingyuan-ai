import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { isChanjingConfigured } from "@/lib/chanjing"
import { listCommonAudio, listCommonDigitalPersons } from "@/lib/chanjing-audio"
import { getDigitalHumanProvider } from "@/lib/digital-human-provider"
import type {
  PublicDigitalPersonList,
  PublicDigitalPersonOption,
} from "@/lib/api/digital-human"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_PAGE_SIZE = 50

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

/** 只保留可下单的形态（type 非空且宽高为正）。 */
function toFigures(figures: Array<{ type?: string | null; width?: number | null; height?: number | null }> | undefined) {
  return (figures ?? [])
    .filter((f) => Boolean(f.type) && (f.width ?? 0) > 0 && (f.height ?? 0) > 0)
    .map((f) => ({ type: f.type as string, width: f.width as number, height: f.height as number }))
}

/**
 * 公共数字人列表（蝉镜开放平台）。
 *
 * 服务端代理：access_token 只存在于服务端，前端拿到的仅是归一后的形象信息。
 * 未配置供应商时返回 not_configured（200），由前端展示配置引导，不当作错误。
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request)
    if (getDigitalHumanProvider() !== "chanjing" || !isChanjingConfigured()) {
      return NextResponse.json({
        status: "not_configured",
        message: "蝉镜数字人服务暂未配置，请联系管理员",
      } satisfies PublicDigitalPersonList)
    }

    const params = request.nextUrl.searchParams
    const page = parsePositiveInt(params.get("page"), 1, 100)
    const size = parsePositiveInt(params.get("size"), 20, MAX_PAGE_SIZE)

    // 形象与兜底音色并行拉取：公共数字人未必绑定音色，缺省时用公共音色保证可下单
    const [persons, audios] = await Promise.all([
      listCommonDigitalPersons(page, size),
      listCommonAudio(1, MAX_PAGE_SIZE),
    ])

    const normalized: PublicDigitalPersonOption[] = persons
      .map((person) => ({
        id: person.id,
        name: person.name?.trim() || "未命名数字人",
        gender: person.gender?.trim() || null,
        defaultVoiceId: person.audio_man_id?.trim() || null,
        voiceName: person.audio_name?.trim() || null,
        figures: toFigures(person.figures),
      }))
      .filter((person) => person.figures.length > 0)

    return NextResponse.json({
      status: "ok",
      persons: normalized,
      fallbackVoiceId: audios[0]?.id ?? null,
      fetchedAt: new Date().toISOString(),
    } satisfies PublicDigitalPersonList)
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    console.error("[digital-human] 公共数字人列表读取失败", error)
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "读取公共数字人失败",
    } satisfies PublicDigitalPersonList)
  }
}
