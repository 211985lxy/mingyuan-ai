import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  isChanjingConfigured: vi.fn(() => true),
  getDigitalHumanProvider: vi.fn(() => "chanjing"),
  listCommonDigitalPersons: vi.fn(),
  listCommonAudio: vi.fn(),
  isHeygenConfigured: vi.fn(() => true),
  listAvatars: vi.fn(),
  listVoices: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: m.authenticateRequest,
  authErrorResponse: m.authErrorResponse,
}))
vi.mock("@/lib/chanjing", () => ({ isChanjingConfigured: m.isChanjingConfigured }))
vi.mock("@/lib/digital-human-provider", () => ({
  getDigitalHumanProvider: m.getDigitalHumanProvider,
}))
vi.mock("@/lib/chanjing-audio", () => ({
  listCommonDigitalPersons: m.listCommonDigitalPersons,
  listCommonAudio: m.listCommonAudio,
}))
vi.mock("@/lib/heygen", () => ({
  isHeygenConfigured: m.isHeygenConfigured,
  listAvatars: m.listAvatars,
  listVoices: m.listVoices,
}))

import { GET } from "@/app/api/digital-human/public-persons/route"

function req(query = "") {
  return new NextRequest(new URL(`http://localhost/api/digital-human/public-persons${query}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  m.authenticateRequest.mockResolvedValue({ id: "user-1" })
  m.isChanjingConfigured.mockReturnValue(true)
  m.getDigitalHumanProvider.mockReturnValue("chanjing")
  m.listCommonAudio.mockResolvedValue([{ id: "voice-fallback", name: "公共音色" }])
  m.listCommonDigitalPersons.mockResolvedValue([])
  m.isHeygenConfigured.mockReturnValue(true)
  m.listAvatars.mockResolvedValue([])
  m.listVoices.mockResolvedValue([])
})

describe("公共数字人列表路由", () => {
  it("未配置蝉镜时返回 not_configured 而非报错", async () => {
    m.isChanjingConfigured.mockReturnValue(false)
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("not_configured")
    expect(m.listCommonDigitalPersons).not.toHaveBeenCalled()
  })

  it("供应商非蝉镜时同样按未配置处理", async () => {
    m.getDigitalHumanProvider.mockReturnValue("shanjian")
    const body = await (await GET(req())).json()
    expect(body.status).toBe("not_configured")
  })

  it("归一化形象：过滤不可下单的形态，保留默认音色与兜底音色", async () => {
    m.listCommonDigitalPersons.mockResolvedValue([
      {
        id: "dp-1",
        name: " 海城-商务 ",
        gender: "male",
        audio_man_id: "voice-1",
        audio_name: "商务男声",
        figures: [
          { type: "whole_body", width: 1080, height: 1920 },
          { type: "half_body", width: 0, height: 1920 },
          { type: "", width: 1080, height: 1920 },
        ],
      },
      // 全部形态无效 → 整条剔除
      { id: "dp-2", name: "无形态", figures: [{ type: "whole_body", width: 0, height: 0 }] },
    ])

    const body = await (await GET(req())).json()
    expect(body.status).toBe("ok")
    expect(body.persons).toHaveLength(1)
    expect(body.persons[0]).toMatchObject({
      id: "dp-1",
      name: "海城-商务",
      gender: "male",
      defaultVoiceId: "voice-1",
      voiceName: "商务男声",
    })
    // 只保留宽高为正且 type 非空的形态
    expect(body.persons[0].figures).toEqual([
      { type: "whole_body", width: 1080, height: 1920 },
    ])
    expect(body.fallbackVoiceId).toBe("voice-fallback")
  })

  it("形象未绑定音色时仍返回，由 fallbackVoiceId 兜底", async () => {
    m.listCommonDigitalPersons.mockResolvedValue([
      { id: "dp-3", name: "公共形象", figures: [{ type: "whole_body", width: 1080, height: 1920 }] },
    ])
    const body = await (await GET(req())).json()
    expect(body.persons[0].defaultVoiceId).toBeNull()
    expect(body.fallbackVoiceId).toBe("voice-fallback")
  })

  it("供应商调用失败时返回 error 态而非抛出", async () => {
    m.listCommonDigitalPersons.mockRejectedValue(new Error("蝉镜数字人服务暂未配置"))
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("error")
    expect(body.message).toContain("暂未配置")
  })

  it("分页参数做上界钳制，避免请求超量数据", async () => {
    await GET(req("?page=0&size=9999"))
    expect(m.listCommonDigitalPersons).toHaveBeenCalledWith(1, 50)
  })

  // ─── HeyGen 分支 ────────────────────────────────────────

  describe("供应商为 HeyGen", () => {
    beforeEach(() => {
      m.getDigitalHumanProvider.mockReturnValue("heygen")
    })

    it("列出 HeyGen 形象并带出默认音色名，形态留空（HeyGen 按比例下单）", async () => {
      m.listAvatars.mockResolvedValue([
        { id: "hg-1", name: " 商务主持 ", gender: "male", default_voice_id: "hv-1", consent_status: "approved" },
      ])
      m.listVoices.mockResolvedValue([{ voice_id: "hv-1", name: "普通话女声" }])

      const body = await (await GET(req())).json()
      expect(body.status).toBe("ok")
      expect(body.persons).toHaveLength(1)
      expect(body.persons[0]).toMatchObject({
        id: "hg-1",
        name: "商务主持",
        defaultVoiceId: "hv-1",
        voiceName: "普通话女声",
        figures: [],
      })
      expect(body.fallbackVoiceId).toBe("hv-1")
      expect(m.listCommonDigitalPersons).not.toHaveBeenCalled()
    })

    it("剔除尚未授权的形象（consent_status=pending）", async () => {
      m.listAvatars.mockResolvedValue([
        { id: "hg-ok", name: "已授权", consent_status: "approved" },
        { id: "hg-pending", name: "待授权", consent_status: "pending" },
        { id: "hg-rejected", name: "已拒绝", consent_status: "rejected" },
      ])
      const body = await (await GET(req())).json()
      expect(body.persons.map((p: { id: string }) => p.id)).toEqual(["hg-ok"])
    })

    it("consent_status 为 null/缺失表示不需要授权，应当保留", async () => {
      m.listAvatars.mockResolvedValue([
        { id: "hg-null", name: "照片形象", consent_status: null },
        { id: "hg-missing", name: "公共形象" },
      ])
      const body = await (await GET(req())).json()
      expect(body.persons.map((p: { id: string }) => p.id)).toEqual(["hg-null", "hg-missing"])
    })

    it("HeyGen 未配置时返回 not_configured", async () => {
      m.isHeygenConfigured.mockReturnValue(false)
      const body = await (await GET(req())).json()
      expect(body.status).toBe("not_configured")
      expect(m.listAvatars).not.toHaveBeenCalled()
    })
  })
})

// 导出便于直接单测授权判定
describe("isHeygenConsentUsable", () => {
  it("只在明确非 approved 时拒绝", async () => {
    const { isHeygenConsentUsable } = await import("@/app/api/digital-human/public-persons/route")
    for (const ok of [null, undefined, "", "approved", "APPROVED", " approved "]) {
      expect(isHeygenConsentUsable(ok as string | null | undefined)).toBe(true)
    }
    for (const bad of ["pending", "rejected", "expired", "revoked"]) {
      expect(isHeygenConsentUsable(bad)).toBe(false)
    }
  })
})
