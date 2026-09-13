import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  isFishAudioConfigured: vi.fn(),
  isOssConfigured: vi.fn(),
  uploadBufferToOss: vi.fn(),
  generateSignedUrl: vi.fn(),
  isChanjingConfigured: vi.fn(),
  createDigitalHumanVideoFromAudio: vi.fn(),
}))

vi.mock("@/lib/voice/fish-audio", () => ({
  synthesizeSpeech: mocks.synthesizeSpeech,
  isFishAudioConfigured: mocks.isFishAudioConfigured,
  FISH_AUDIO_MAX_TEXT_LENGTH: 4000,
}))

vi.mock("@/lib/oss", () => ({
  isOssConfigured: mocks.isOssConfigured,
  uploadBufferToOss: mocks.uploadBufferToOss,
  generateSignedUrl: mocks.generateSignedUrl,
}))

vi.mock("@/lib/chanjing", () => ({
  isChanjingConfigured: mocks.isChanjingConfigured,
}))

vi.mock("@/lib/chanjing-audio", () => ({
  createDigitalHumanVideoFromAudio: mocks.createDigitalHumanVideoFromAudio,
}))

import {
  CHANJING_GRAB_URL_TTL_SECONDS,
  DigitalHumanVoiceBridgeError,
  buildVoiceObjectKey,
  createOwnVoiceDigitalHumanVideo,
  synthesizeOwnVoiceToOss,
} from "@/lib/digital-human-voice-bridge"

function synthResult(charCount = 12) {
  const bytes = new Uint8Array(1024).buffer
  return {
    audio: bytes,
    contentType: "audio/mpeg",
    model: "s2.1-pro-free",
    voiceId: null,
    charCount,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isFishAudioConfigured.mockReturnValue(true)
  mocks.isOssConfigured.mockReturnValue(true)
  mocks.isChanjingConfigured.mockReturnValue(true)
  mocks.uploadBufferToOss.mockResolvedValue(
    "https://bucket.oss-cn-region.aliyuncs.com/digital-human-voice/u1/x.mp3",
  )
  mocks.generateSignedUrl.mockImplementation(
    (url: string) => `https://bucket.oss-cn-region.aliyuncs.com/signed/${url.slice(-8)}`,
  )
  mocks.synthesizeSpeech.mockResolvedValue(synthResult())
})

describe("synthesizeOwnVoiceToOss", () => {
  it("合成后落 OSS 并按抓取 TTL 显式签名", async () => {
    const out = await synthesizeOwnVoiceToOss({ userId: "u1", text: "你好世界" })

    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ text: "你好世界", format: "mp3" }),
    )
    expect(mocks.uploadBufferToOss).toHaveBeenCalledWith(
      expect.stringMatching(/^digital-human-voice\/u1\/\d{14}-[0-9a-f]{8}\.mp3$/),
      expect.any(Buffer),
      "audio/mpeg",
    )
    expect(mocks.generateSignedUrl).toHaveBeenCalledWith(
      "https://bucket.oss-cn-region.aliyuncs.com/digital-human-voice/u1/x.mp3",
      CHANJING_GRAB_URL_TTL_SECONDS,
    )
    expect(out.signedUrl).toContain("/signed/")
    expect(out.bytes).toBe(1024)
    expect(out.model).toBe("s2.1-pro-free")
  })

  it("抓取 TTL 必须远大于视频轮询 20 分钟超时", () => {
    expect(CHANJING_GRAB_URL_TTL_SECONDS).toBeGreaterThan(20 * 60)
  })

  it("语音服务未配置时 fail-closed", async () => {
    mocks.isFishAudioConfigured.mockReturnValue(false)
    await expect(synthesizeOwnVoiceToOss({ userId: "u1", text: "x" })).rejects.toMatchObject({
      code: "VOICE_NOT_CONFIGURED",
    })
  })

  it("OSS 未配置时 fail-closed（蝉镜链路无法降级）", async () => {
    mocks.isOssConfigured.mockReturnValue(false)
    await expect(synthesizeOwnVoiceToOss({ userId: "u1", text: "x" })).rejects.toMatchObject({
      code: "OSS_NOT_CONFIGURED",
    })
  })

  it("超长文案拒绝并提示拆分", async () => {
    await expect(
      synthesizeOwnVoiceToOss({ userId: "u1", text: "长".repeat(4001) }),
    ).rejects.toBeInstanceOf(DigitalHumanVoiceBridgeError)
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled()
  })

  it("超过蝉镜 100MB 音频上限时拒绝下单", async () => {
    mocks.synthesizeSpeech.mockResolvedValue({
      ...synthResult(),
      audio: new Uint8Array(100 * 1024 * 1024 + 1).buffer,
    })
    await expect(synthesizeOwnVoiceToOss({ userId: "u1", text: "x" })).rejects.toMatchObject({
      code: "AUDIO_TOO_LARGE",
    })
    expect(mocks.uploadBufferToOss).not.toHaveBeenCalled()
  })

  it("对象键按用户与格式隔离", () => {
    const a = buildVoiceObjectKey("u1", "mp3")
    const b = buildVoiceObjectKey("u2", "wav")
    expect(a).toContain("digital-human-voice/u1/")
    expect(a.endsWith(".mp3")).toBe(true)
    expect(b.endsWith(".wav")).toBe(true)
    expect(a).not.toBe(b)
  })
})

describe("createOwnVoiceDigitalHumanVideo", () => {
  it("受管 OSS URL 会重新签名后转交蝉镜 audio 型下单", async () => {
    mocks.createDigitalHumanVideoFromAudio.mockResolvedValue({ taskId: "cj-task-1", payload: {} })

    const out = await createOwnVoiceDigitalHumanVideo({
      audioUrl: "https://bucket.oss-cn-region.aliyuncs.com/digital-human-voice/u1/x.mp3",
      personId: "dp-1",
      figureType: "whole_body",
      personWidth: 1080,
      personHeight: 1920,
    })

    expect(mocks.generateSignedUrl).toHaveBeenCalledWith(
      "https://bucket.oss-cn-region.aliyuncs.com/digital-human-voice/u1/x.mp3",
      CHANJING_GRAB_URL_TTL_SECONDS,
    )
    expect(mocks.createDigitalHumanVideoFromAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        wavUrl: expect.stringContaining("/signed/"),
        personId: "dp-1",
        figureType: "whole_body",
      }),
    )
    expect(out.taskId).toBe("cj-task-1")
  })

  it("蝉镜未配置时 fail-closed", async () => {
    mocks.isChanjingConfigured.mockReturnValue(false)
    await expect(
      createOwnVoiceDigitalHumanVideo({
        audioUrl: "https://example.com/a.mp3",
        personId: "dp-1",
        figureType: "whole_body",
        personWidth: 1080,
        personHeight: 1920,
      }),
    ).rejects.toMatchObject({ code: "CHANJING_NOT_CONFIGURED" })
    expect(mocks.createDigitalHumanVideoFromAudio).not.toHaveBeenCalled()
  })
})
