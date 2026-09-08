import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * 语音工坊历史落库契约：
 * - POST /api/voice/tts 纯合成，不碰历史表；创作页内嵌试听保持内存态
 * - POST /api/voice/history 导入整段音频（转存 OSS + 全文落库）
 * - GET /api/voice/history 倒序分页；DELETE 删除当前用户记录
 */

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  synthesize: vi.fn(),
  persist: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mocks.authenticate(...(args as [])),
}))

vi.mock("@/lib/voice/fish-audio", () => ({
  FishAudioError: class FishAudioError extends Error {
    constructor(message: string, public status: number, public code: string) {
      super(message)
    }
  },
  FISH_AUDIO_MAX_TEXT_LENGTH: 4000,
  synthesizeSpeech: (...args: unknown[]) => mocks.synthesize(...(args as [])),
}))

vi.mock("@/lib/voice/history", () => ({
  persistSynthesis: (...args: unknown[]) => mocks.persist(...(args as [])),
  listSyntheses: (...args: unknown[]) => mocks.list(...(args as [])),
  deleteSynthesis: (...args: unknown[]) => mocks.remove(...(args as [])),
  VOICE_MAX_TOTAL_TEXT_LENGTH: 12000,
}))

const { POST: ttsPOST } = await import("@/app/api/voice/tts/route")
const { GET: historyGET, POST: historyPOST, DELETE: historyDELETE } = await import(
  "@/app/api/voice/history/route"
)

function jsonRequest(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function multipartRequest(body: FormData): NextRequest {
  return new NextRequest("http://localhost/api/voice/history", { method: "POST", body })
}

const USER = { id: "u1", email: "u1@test" }

describe("语音合成与历史落库", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
  })

  it("tts 合成是纯合成：不落历史表，音频照常返回", async () => {
    mocks.authenticate.mockResolvedValue(USER)
    mocks.synthesize.mockResolvedValue({ audio: new Uint8Array([1]), contentType: "audio/mpeg", model: "s2.1-pro-free", charCount: 9 })

    const response = await ttsPOST(jsonRequest("http://localhost/api/voice/tts", {
      text: "供暖改造避坑第一条",
      voiceId: "voice-a",
      format: "mp3",
    }))

    expect(response.status).toBe(200)
    expect(mocks.synthesize).toHaveBeenCalledTimes(1)
    expect(mocks.persist).not.toHaveBeenCalled()
  })

  it("history 导入：音频转存落库，返回记录 id", async () => {
    mocks.authenticate.mockResolvedValue(USER)
    mocks.persist.mockResolvedValue("vsr-1")

    const form = new FormData()
    form.set("text", "供暖改造避坑第一条")
    form.set("model", "s2.1-pro-free")
    form.set("segments", "1")
    form.set("audio", new File([new Uint8Array([1, 2, 3])], "voice.mp3", { type: "audio/mpeg" }))

    const response = await historyPOST(multipartRequest(form))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.data.recordId).toBe("vsr-1")
    expect(mocks.persist).toHaveBeenCalledTimes(1)
    const input = mocks.persist.mock.calls[0][0]
    expect(input.userId).toBe("u1")
    expect(input.model).toBe("s2.1-pro-free")
    expect(input.segments).toBe(1)
  })

  it("history 导入缺少音频返回 400，不触发落库", async () => {
    mocks.authenticate.mockResolvedValue(USER)

    const form = new FormData()
    form.set("text", "只有文案没有音频")

    const response = await historyPOST(multipartRequest(form))
    expect(response.status).toBe(400)
    expect(mocks.persist).not.toHaveBeenCalled()
  })

  it("历史接口返回当前用户倒序分页数据", async () => {
    mocks.authenticate.mockResolvedValue(USER)
    mocks.list.mockResolvedValue({
      items: [{ id: "vsr-1", textPreview: "测试", audioUrl: null, segments: 2 }],
      total: 1,
    })

    const response = await historyGET(new NextRequest("http://localhost/api/voice/history?page=1&pageSize=20"))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.data.total).toBe(1)
    expect(payload.data.items[0].id).toBe("vsr-1")
    const [userId, page, pageSize] = mocks.list.mock.calls[0]
    expect(userId).toBe("u1")
    expect(page).toBe(1)
    expect(pageSize).toBe(20)
  })

  it("删除他人的记录返回 404", async () => {
    mocks.authenticate.mockResolvedValue(USER)
    mocks.remove.mockResolvedValue(false)

    const response = await historyDELETE(jsonRequest("http://localhost/api/voice/history", { id: "nope" }, "DELETE"))
    expect(response.status).toBe(404)
  })

  it("未登录访问历史接口返回 401", async () => {
    mocks.authenticate.mockResolvedValue(null)
    const response = await historyGET(new NextRequest("http://localhost/api/voice/history"))
    expect(response.status).toBe(401)
  })
})
