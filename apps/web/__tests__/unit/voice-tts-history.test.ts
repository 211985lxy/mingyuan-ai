import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * 语音工坊落库（Fish Audio MVP「不落库」缺口补全）：
 * - POST /api/voice/tts 合成成功后落一条合成记录；落库失败不影响音频返回
 * - GET /api/voice/history 返回当前用户的倒序分页历史
 */

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  synthesize: vi.fn(),
  createRecord: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
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
  FISH_AUDIO_MAX_TEXT_LENGTH: 2000,
  synthesizeSpeech: (...args: unknown[]) => mocks.synthesize(...(args as [])),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    voiceSynthesisRecord: {
      create: (...args: unknown[]) => mocks.createRecord(...(args as [])),
      findMany: (...args: unknown[]) => mocks.findMany(...(args as [])),
      count: (...args: unknown[]) => mocks.count(...(args as [])),
    },
  },
}))

const { POST: ttsPOST } = await import("@/app/api/voice/tts/route")
const { GET: historyGET } = await import("@/app/api/voice/history/route")

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const USER = { id: "u1", email: "u1@test" }

describe("语音合成记录落库", () => {
  beforeEach(() => {
    mocks.authenticate.mockReset()
    mocks.synthesize.mockReset()
    mocks.createRecord.mockReset()
    mocks.findMany.mockReset()
    mocks.count.mockReset()
  })

  it("合成成功后落一条记录（用户/模型/字数/预览）", async () => {
    mocks.authenticate.mockResolvedValue(USER)
    mocks.synthesize.mockResolvedValue({ audio: new Uint8Array([1]), contentType: "audio/mpeg", model: "s2.1-pro-free", charCount: 12 })
    mocks.createRecord.mockResolvedValue({ id: "vsr-1" })

    const response = await ttsPOST(jsonRequest("http://localhost/api/voice/tts", {
      text: "供暖改造避坑第一条",
      voiceId: "voice-a",
      format: "mp3",
    }))

    expect(response.status).toBe(200)
    expect(mocks.createRecord).toHaveBeenCalledTimes(1)
    const data = mocks.createRecord.mock.calls[0][0].data
    expect(data.userId).toBe("u1")
    expect(data.model).toBe("s2.1-pro-free")
    expect(data.charCount).toBe(12)
    expect(data.status).toBe("succeeded")
    expect(data.textPreview).toContain("供暖改造")
  })

  it("落库失败不阻塞音频返回（元数据非关键路径）", async () => {
    mocks.authenticate.mockResolvedValue(USER)
    mocks.synthesize.mockResolvedValue({ audio: new Uint8Array([1]), contentType: "audio/mpeg", model: "m", charCount: 3 })
    mocks.createRecord.mockRejectedValue(new Error("db down"))

    const response = await ttsPOST(jsonRequest("http://localhost/api/voice/tts", { text: "测试" }))
    expect(response.status).toBe(200)
  })

  it("历史接口返回当前用户倒序分页数据", async () => {
    mocks.authenticate.mockResolvedValue(USER)
    mocks.findMany.mockResolvedValue([
      { id: "vsr-1", model: "m", voiceId: null, format: "mp3", textPreview: "测试", charCount: 2, status: "succeeded", createdAt: new Date() },
    ])
    mocks.count.mockResolvedValue(1)

    const response = await historyGET(new NextRequest("http://localhost/api/voice/history?page=1&pageSize=20"))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.data.total).toBe(1)
    expect(payload.data.items[0].id).toBe("vsr-1")
    const where = mocks.findMany.mock.calls[0][0].where
    expect(where.userId).toBe("u1")
  })

  it("未登录访问历史接口返回 401", async () => {
    mocks.authenticate.mockResolvedValue(null)
    const response = await historyGET(new NextRequest("http://localhost/api/voice/history"))
    expect(response.status).toBe(401)
  })
})
