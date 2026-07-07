import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"

// ─── Mock Shanjian before imports ─────────────────────────

const {
  mockTextToSpeech,
  mockAudioToText,
} = vi.hoisted(() => ({
  mockTextToSpeech: vi.fn(),
  mockAudioToText: vi.fn(),
}))

vi.mock("@/lib/shanjian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shanjian")>()
  return {
    ...actual,
    textToSpeech: mockTextToSpeech,
    audioToText: mockAudioToText,
  }
})

import { prisma, cleanDatabase, disconnectAll, cleanRedis, req, json } from "./helpers"
import { POST as TTS_POST } from "@/app/api/effects/tts/route"
import { POST as ASR_POST } from "@/app/api/effects/asr/route"
import jwt from "jsonwebtoken"

let user: { id: string; email: string }
let token: string

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } })
}

describe("Effects E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const u = await prisma.user.create({
      data: {
        email: "effects-test@e2e.com",
        password: "hashed",
        name: "Effects Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    user = { id: u.id, email: u.email }
    token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: "1h" })
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  beforeEach(() => {
    mockTextToSpeech.mockReset()
    mockAudioToText.mockReset()
  })

  // ─── POST /api/effects/tts ──────────────────────────────

  describe("TTS", () => {
    it("generates TTS with valid body", async () => {
      mockTextToSpeech.mockResolvedValue("tts-task-1")

      const res = await TTS_POST(
        userReq("/api/effects/tts", {
          method: "POST",
          body: {
            text: "你好世界",
            speakerId: "speaker-123",
            language: "zh",
            speedRatio: 1.0,
            volume: 100,
            codec: "mp3",
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(201)

      const body = await json(res)
      expect(body.data.taskId).toBe("tts-task-1")
    })

    it("generates TTS with minimal fields", async () => {
      mockTextToSpeech.mockResolvedValue("tts-task-2")

      const res = await TTS_POST(
        userReq("/api/effects/tts", {
          method: "POST",
          body: {
            text: "Hello",
            speakerId: "speaker-456",
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(201)

      const body = await json(res)
      expect(body.data.taskId).toBe("tts-task-2")

      // Verify mock was called with correct params
      expect(mockTextToSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Hello",
          speakerId: "speaker-456",
        })
      )
    })

    it("rejects TTS with missing text", async () => {
      const res = await TTS_POST(
        userReq("/api/effects/tts", {
          method: "POST",
          body: { speakerId: "speaker-123" },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)
      const body = await json(res)
      expect(body.error).toContain("required")
    })

    it("rejects TTS with missing speakerId", async () => {
      const res = await TTS_POST(
        userReq("/api/effects/tts", {
          method: "POST",
          body: { text: "Hello" },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)
      const body = await json(res)
      expect(body.error).toContain("required")
    })

    it("rejects TTS without auth", async () => {
      const res = await TTS_POST(
        req("/api/effects/tts", { method: "POST", body: { text: "x", speakerId: "y" } }),
        undefined as never
      )
      expect(res.status).toBe(401)
    })
  })

  // ─── POST /api/effects/asr ──────────────────────────────

  describe("ASR", () => {
    it("generates ASR with valid body", async () => {
      mockAudioToText.mockResolvedValue("asr-task-1")

      const res = await ASR_POST(
        userReq("/api/effects/asr", {
          method: "POST",
          body: {
            audioUrl: "https://example.com/audio.wav",
            language: "zh",
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(201)

      const body = await json(res)
      expect(body.data.taskId).toBe("asr-task-1")
    })

    it("rejects ASR with missing audioUrl", async () => {
      const res = await ASR_POST(
        userReq("/api/effects/asr", {
          method: "POST",
          body: { language: "zh" },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)
      const body = await json(res)
      expect(body.error).toContain("required")
    })

    it("rejects ASR with missing language", async () => {
      const res = await ASR_POST(
        userReq("/api/effects/asr", {
          method: "POST",
          body: { audioUrl: "https://example.com/audio.wav" },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)
      const body = await json(res)
      expect(body.error).toContain("required")
    })

    it("rejects ASR without auth", async () => {
      const res = await ASR_POST(
        req("/api/effects/asr", {
          method: "POST",
          body: { audioUrl: "https://example.com/audio.wav", language: "zh" },
        }),
        undefined as never
      )
      expect(res.status).toBe(401)
    })
  })
})
