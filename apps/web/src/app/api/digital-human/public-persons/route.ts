import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { isChanjingConfigured } from "@/lib/chanjing"
import { listCommonAudio, listCommonDigitalPersons } from "@/lib/chanjing-audio"
import { getDigitalHumanProvider } from "@/lib/digital-human-provider"
import { isHeygenConfigured, listAvatars, listVoices } from "@/lib/heygen"
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

function notConfigured(message: string): NextResponse {
  return NextResponse.json({ status: "not_configured", message } satisfies PublicDigitalPersonList)
}

/**
 * HeyGen 形象的授权可用性判定。
 *
 * 官方口径（AvatarGroupItem.consent_status 与 Avatar Consent 文档）：
 * - `null`/缺失 = **不需要授权**（照片形象、公共形象）
 * - `"approved"` = 已取得授权
 * - 其余（如 `"pending"`）= 尚未取得授权
 *
 * 用未授权形象出片等于生成一个没同意过的人的视频，必须拦住。
 */
export function isHeygenConsentUsable(consentStatus: string | null | undefined): boolean {
  const raw = typeof consentStatus === "string" ? consentStatus.trim().toLowerCase() : ""
  if (!raw) return true
  return raw === "approved"
}

/**
 * HeyGen 公共形象列表。
 *
 * HeyGen 按顶层 aspect_ratio / resolution 下单，没有「像素形态」概念，
 * 因此 figures 留空——形态过滤只对蝉镜适用；可下单性由授权状态决定。
 */
async function listHeygenPersons(size: number): Promise<NextResponse> {
  const [avatars, voices] = await Promise.all([
    listAvatars({ limit: size }),
    listVoices({ limit: MAX_PAGE_SIZE }),
  ])
  const voiceNameById = new Map(voices.map((v) => [v.voice_id, v.name]))

  const persons: PublicDigitalPersonOption[] = avatars
    .filter((avatar) => isHeygenConsentUsable(avatar.consent_status))
    .map((avatar) => {
      const defaultVoiceId = avatar.default_voice_id?.trim() || null
      return {
        id: avatar.id,
        name: avatar.name?.trim() || "未命名数字人",
        gender: avatar.gender?.trim() || null,
        defaultVoiceId,
        voiceName: defaultVoiceId ? voiceNameById.get(defaultVoiceId) ?? null : null,
        figures: [],
      }
    })

  return NextResponse.json({
    status: "ok",
    persons,
    fallbackVoiceId: voices[0]?.voice_id ?? null,
    fetchedAt: new Date().toISOString(),
  } satisfies PublicDigitalPersonList)
}

/**
 * 公共数字人列表（服务端代理，按当前供应商取数）。
 *
 * 供应商凭证只存在于服务端，前端仅得到归一后的形象信息。
 * 未配置供应商时返回 not_configured（200），由前端展示配置引导，不当作错误。
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request)

    const params = request.nextUrl.searchParams
    const page = parsePositiveInt(params.get("page"), 1, 100)
    const size = parsePositiveInt(params.get("size"), 20, MAX_PAGE_SIZE)
    const provider = getDigitalHumanProvider()

    if (provider === "heygen") {
      if (!isHeygenConfigured()) return notConfigured("HeyGen 数字人服务暂未配置，请联系管理员")
      return await listHeygenPersons(size)
    }

    if (provider !== "chanjing" || !isChanjingConfigured()) {
      return notConfigured("蝉镜数字人服务暂未配置，请联系管理员")
    }

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
