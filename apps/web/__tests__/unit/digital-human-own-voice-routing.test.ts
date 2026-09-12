import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createDigitalHumanVideo: vi.fn(),
  createDigitalHumanVideoFromAudio: vi.fn(),
  submitToShanjian: vi.fn(),
}))

vi.mock("@/lib/chanjing", () => ({
  createDigitalHumanVideo: mocks.createDigitalHumanVideo,
  isChanjingConfigured: vi.fn(() => true),
  ChanjingError: class extends Error {},
}))
vi.mock("@/lib/chanjing-audio", () => ({
  createDigitalHumanVideoFromAudio: mocks.createDigitalHumanVideoFromAudio,
}))
vi.mock("@/lib/shanjian", () => ({
  ShanjianError: class extends Error {},
}))
vi.mock("@/lib/shanjian-submit", () => ({
  submitToShanjian: mocks.submitToShanjian,
}))

import { submitVideoToProvider } from "@/lib/digital-human-provider"
import { buildShanjianSubmitPayload } from "@/lib/video-task-request/payload"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("submitVideoToProvider own-voice branch", () => {
  it("routes to audio-type submission with the signed wav url", async () => {
    mocks.createDigitalHumanVideoFromAudio.mockResolvedValue({ taskId: "cj-audio-1", payload: {} })

    const result = await submitVideoToProvider("chanjing", "virtualman_broadcast", {
      virtualmanId: "dp-1",
      ownVoiceAudioUrl: "https://bucket.oss/signed/a.mp3",
      aspectRatio: "9:16",
    })

    expect(result.taskId).toBe("cj-audio-1")
    expect(mocks.createDigitalHumanVideoFromAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        wavUrl: "https://bucket.oss/signed/a.mp3",
        personId: "dp-1",
        figureType: "whole_body",
        personWidth: 1080,
        personHeight: 1920,
      }),
    )
    expect(mocks.createDigitalHumanVideo).not.toHaveBeenCalled()
  })

  it("honors explicit figure type and 16:9 canvas", async () => {
    mocks.createDigitalHumanVideoFromAudio.mockResolvedValue({ taskId: "t", payload: {} })

    await submitVideoToProvider("chanjing", "virtualman_broadcast", {
      virtualmanId: "dp-1",
      ownVoiceAudioUrl: "https://bucket.oss/a.mp3",
      figureType: "half_body",
      aspectRatio: "16:9",
    })

    expect(mocks.createDigitalHumanVideoFromAudio).toHaveBeenCalledWith(
      expect.objectContaining({ figureType: "half_body", personWidth: 1920, personHeight: 1080 }),
    )
  })

  it("keeps the tts path untouched when no own-voice url is present", async () => {
    mocks.createDigitalHumanVideo.mockResolvedValue({ taskId: "cj-tts-1", payload: {} })

    await submitVideoToProvider("chanjing", "virtualman_broadcast", {
      virtualmanId: "dp-1",
      speakerId: "sp-1",
      text: "你好",
    })

    expect(mocks.createDigitalHumanVideo).toHaveBeenCalledWith(
      expect.objectContaining({ personId: "dp-1", audioManId: "sp-1", text: "你好" }),
    )
    expect(mocks.createDigitalHumanVideoFromAudio).not.toHaveBeenCalled()
  })

  it("still rejects a missing digital-human person in audio mode", async () => {
    await expect(
      submitVideoToProvider("chanjing", "virtualman_broadcast", {
        ownVoiceAudioUrl: "https://bucket.oss/a.mp3",
      }),
    ).rejects.toMatchObject({ code: "MISSING_VIDEO_INPUT" })
  })
})

describe("buildShanjianSubmitPayload own-voice fields", () => {
  const baseInput = {
    body: {
      type: "virtualman_broadcast",
      projectId: "p1",
      scriptContent: "正文",
      voiceSource: "own_voice" as const,
      voiceId: "fish-voice-1",
    },
    plan: null,
    videoType: "virtualman_broadcast" as const,
    avatar: null,
    scriptContent: "正文",
    aspectRatio: "9:16" as const,
  }

  it("carries the signed url and audioType marker while hiding request-only fields", () => {
    const payload = buildShanjianSubmitPayload({ ...baseInput, ownVoiceAudioUrl: "https://bucket.oss/s.mp3" })

    expect(payload.ownVoiceAudioUrl).toBe("https://bucket.oss/s.mp3")
    expect(payload.audioType).toBe("audio")
    expect(payload).not.toHaveProperty("voiceSource")
    expect(payload).not.toHaveProperty("voiceId")
  })

  it("omits audio fields entirely for the default tts flow", () => {
    const payload = buildShanjianSubmitPayload({ ...baseInput, body: { ...baseInput.body, voiceSource: undefined } })

    expect(payload).not.toHaveProperty("ownVoiceAudioUrl")
    expect(payload).not.toHaveProperty("audioType")
  })
})
