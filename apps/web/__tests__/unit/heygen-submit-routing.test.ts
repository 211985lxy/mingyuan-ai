import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createHeygenVideo: vi.fn(),
  getHeygenVideo: vi.fn(),
}))

vi.mock("@/lib/heygen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/heygen")>()
  return {
    ...actual,
    createVideo: mocks.createHeygenVideo,
    getVideo: mocks.getHeygenVideo,
    isHeygenConfigured: () => true,
  }
})
vi.mock("@/lib/chanjing", () => ({ isChanjingConfigured: () => false, ChanjingError: class extends Error {} }))
vi.mock("@/lib/chanjing-audio", () => ({ createDigitalHumanVideoFromAudio: vi.fn() }))
vi.mock("@/lib/shanjian", () => ({ ShanjianError: class extends Error {} }))

import { submitVideoToProvider, isDigitalHumanProvider, normalizeDigitalHumanProvider } from "@/lib/digital-human-provider"

beforeEach(() => vi.clearAllMocks())

describe("HeyGen 出片路由", () => {
  it("脚本驱动：传 script + voice_id，不传 audio_url", async () => {
    mocks.createHeygenVideo.mockResolvedValue({ taskId: "hg-1", payload: {} })
    const out = await submitVideoToProvider("heygen", "virtualman_broadcast", {
      virtualmanId: "avatar-1",
      speakerId: "voice-1",
      text: "口播正文",
      aspectRatio: "9:16",
    })
    expect(out.taskId).toBe("hg-1")
    const arg = mocks.createHeygenVideo.mock.calls[0][0]
    expect(arg).toMatchObject({ type: "avatar", avatar_id: "avatar-1", script: "口播正文", voice_id: "voice-1", aspect_ratio: "9:16" })
    expect(arg.audio_url).toBeUndefined()
  })

  it("自有语音驱动：传 audio_url，且脚本不得同时下发（互斥）", async () => {
    mocks.createHeygenVideo.mockResolvedValue({ taskId: "hg-2", payload: {} })
    await submitVideoToProvider("heygen", "virtualman_broadcast", {
      virtualmanId: "avatar-1",
      speakerId: "voice-1",
      text: "这段文字不应被下发",
      ownVoiceAudioUrl: "https://oss.example.com/signed.mp3",
      aspectRatio: "16:9",
    })
    const arg = mocks.createHeygenVideo.mock.calls[0][0]
    expect(arg.audio_url).toBe("https://oss.example.com/signed.mp3")
    expect(arg.script).toBeUndefined()
    expect(arg.aspect_ratio).toBe("16:9")
  })

  it("音频驱动下把 own-voice 快照并入返回载荷（供重试还原音源）", async () => {
    mocks.createHeygenVideo.mockResolvedValue({ taskId: "hg-3", payload: { provider: "heygen" } })
    const out = await submitVideoToProvider("heygen", "virtualman_broadcast", {
      virtualmanId: "avatar-1",
      ownVoiceAudioUrl: "https://oss.example.com/signed.mp3",
      ownVoiceVoiceId: "fish-9",
    })
    expect(out.payload.audioType).toBe("audio")
    expect(out.payload.ownVoiceVoiceId).toBe("fish-9")
  })

  it("缺形象或既无音频又无音色/文案时 fail-closed", async () => {
    await expect(submitVideoToProvider("heygen", "virtualman_broadcast", { speakerId: "v", text: "t" }))
      .rejects.toMatchObject({ code: "MISSING_VIDEO_INPUT" })
    await expect(submitVideoToProvider("heygen", "virtualman_broadcast", { virtualmanId: "a", text: "只有文案" }))
      .rejects.toMatchObject({ code: "MISSING_VIDEO_INPUT" })
    await expect(submitVideoToProvider("heygen", "ai_cover", { virtualmanId: "a", text: "t", speakerId: "v" }))
      .rejects.toMatchObject({ code: "UNSUPPORTED_VIDEO_TYPE" })
    expect(mocks.createHeygenVideo).not.toHaveBeenCalled()
  })

  it("类型判定与归一识别 heygen，且不误伤既有供应商", () => {
    expect(isDigitalHumanProvider("heygen")).toBe(true)
    expect(normalizeDigitalHumanProvider("heygen")).toBe("heygen")
    expect(normalizeDigitalHumanProvider("chanjing")).toBe("chanjing")
    expect(normalizeDigitalHumanProvider("unknown")).toBe("chanjing")
  })
})
