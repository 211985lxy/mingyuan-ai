import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"

// ─── Mock Shanjian before imports ─────────────────────────

const {
  mockCloneVoice,
  mockGetPublicVoices,
  mockDeleteAsset,
} = vi.hoisted(() => ({
  mockCloneVoice: vi.fn(),
  mockGetPublicVoices: vi.fn(),
  mockDeleteAsset: vi.fn(),
}))

vi.mock("@/lib/shanjian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shanjian")>()
  return {
    ...actual,
    cloneVoice: mockCloneVoice,
    getPublicVoices: mockGetPublicVoices,
    deleteAsset: mockDeleteAsset,
  }
})

import { prisma, cleanDatabase, disconnectAll, cleanRedis, req, json } from "./helpers"
import { POST, GET } from "@/app/api/voices/route"
import { DELETE } from "@/app/api/voices/[id]/route"
import jwt from "jsonwebtoken"

let user: { id: string; email: string }
let token: string

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } })
}

describe("Voices E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const u = await prisma.user.create({
      data: {
        email: "voice-test@e2e.com",
        password: "hashed",
        name: "Voice Tester",
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
    mockCloneVoice.mockReset()
    mockGetPublicVoices.mockReset()
    mockDeleteAsset.mockReset()
  })

  // ─── POST /api/voices ──────────────────────────────────

  it("creates a voice clone", async () => {
    mockCloneVoice.mockResolvedValue("voice-task-1")

    const res = await POST(
      userReq("/api/voices", {
        method: "POST",
        body: {
          name: "My Voice",
          audioUrl: "https://example.com/audio.wav",
          model: "v1",
          language: "zh",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(201)

    const body = await json(res)
    expect(body.data.name).toBe("My Voice")
    expect(body.data.assetType).toBe("voice")
    expect(body.data.status).toBe("processing")
    expect(body.data.externalTaskId).toBe("voice-task-1")
    expect(body.data.voiceModel).toBe("v1")
    expect(body.data.userId).toBe(user.id)

    // Verify DB record
    const dbAsset = await prisma.asset.findUnique({ where: { id: body.data.id } })
    expect(dbAsset).not.toBeNull()
    expect(dbAsset!.externalTaskId).toBe("voice-task-1")
    expect(dbAsset!.assetType).toBe("voice")
  })

  it("rejects POST with missing required fields", async () => {
    const res = await POST(
      userReq("/api/voices", {
        method: "POST",
        body: { name: "Incomplete" },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("required")
  })

  it("rejects POST with invalid model", async () => {
    const res = await POST(
      userReq("/api/voices", {
        method: "POST",
        body: {
          name: "Bad Model",
          audioUrl: "https://example.com/audio.wav",
          model: "invalid_model",
          language: "zh",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("model")
  })

  it("creates voice with model=s3", async () => {
    mockCloneVoice.mockResolvedValue("voice-task-s3")

    const res = await POST(
      userReq("/api/voices", {
        method: "POST",
        body: {
          name: "S3 Voice",
          audioUrl: "https://example.com/audio.wav",
          model: "s3",
          language: "en",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(201)

    const body = await json(res)
    expect(body.data.voiceModel).toBe("s3")
  })

  // ─── GET /api/voices ───────────────────────────────────

  it("lists user voices and public voices", async () => {
    mockGetPublicVoices.mockResolvedValue([
      { id: "pub-1", name: "Public Voice", gender: "female", coverUrl: "", demoUrl: "", langs: ["zh"] },
    ])

    const res = await GET(
      userReq("/api/voices"),
      undefined as never
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.userVoices).toBeDefined()
    expect(body.data.publicVoices).toBeDefined()
    expect(body.data.userVoices.length).toBeGreaterThanOrEqual(1)
    expect(body.data.userVoices.every((v: { userId: string }) => v.userId === user.id)).toBe(true)
    expect(body.data.publicVoices.length).toBe(1)
    expect(body.data.publicVoices[0].name).toBe("Public Voice")
  })

  // ─── DELETE /api/voices/[id] ───────────────────────────

  it("deletes a voice", async () => {
    mockDeleteAsset.mockResolvedValue(undefined)

    const asset = await prisma.asset.create({
      data: {
        userId: user.id,
        name: "Voice To Delete",
        assetType: "voice",
        url: "https://example.com/audio.wav",
        status: "ready",
        externalSpeakerId: "sp-delete",
      },
    })

    const res = await DELETE(
      userReq(`/api/voices/${asset.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: asset.id }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.deleted).toBe(true)

    // Verify DB deletion
    const gone = await prisma.asset.findUnique({ where: { id: asset.id } })
    expect(gone).toBeNull()
  })

  it("returns 404 for non-existent voice", async () => {
    const res = await DELETE(
      userReq("/api/voices/nonexistent-id", { method: "DELETE" }),
      { params: Promise.resolve({ id: "nonexistent-id" }) }
    )
    expect(res.status).toBe(404)
  })

  it("returns 404 when deleting another user's voice", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: "other-voice@e2e.com",
        password: "hashed",
        name: "Other",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    const otherVoice = await prisma.asset.create({
      data: {
        userId: otherUser.id,
        name: "Other Voice",
        assetType: "voice",
        url: "https://example.com/other.wav",
        status: "ready",
      },
    })

    const res = await DELETE(
      userReq(`/api/voices/${otherVoice.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: otherVoice.id }) }
    )
    expect(res.status).toBe(404)
  })

  it("returns 404 when deleting non-voice asset via voice route", async () => {
    const imageAsset = await prisma.asset.create({
      data: {
        userId: user.id,
        name: "An Image",
        assetType: "image",
        url: "https://example.com/photo.jpg",
      },
    })

    const res = await DELETE(
      userReq(`/api/voices/${imageAsset.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: imageAsset.id }) }
    )
    expect(res.status).toBe(404)
  })
})
